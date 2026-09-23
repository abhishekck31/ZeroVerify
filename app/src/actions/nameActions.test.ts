import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioural tests for the name verification actions.
 *
 * These are the endpoints that decide who may read a request and whose word is
 * taken for a proof, so the cases below are the security properties rather
 * than the happy path: an unauthenticated caller, a stranger, a token for a
 * different request, an invalid proof, and a proof about the wrong value.
 */

// --- mocks ------------------------------------------------------------------

const clerk = vi.hoisted(() => ({
  userId: null as string | null,
  email: null as string | null,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
  currentUser: async () =>
    clerk.email ? { primaryEmailAddress: { emailAddress: clerk.email } } : null,
}));

vi.mock("@/utils/connectToDb", () => ({ default: vi.fn(async () => undefined) }));

const store = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  saved: [] as Record<string, unknown>[],
}));

vi.mock("@/models/nameModel", () => {
  class NameVerify {
    constructor(fields: Record<string, unknown>) {
      Object.assign(this, fields);
      (this as Record<string, unknown>)._id = "new-id";
    }
    async save() {
      store.saved.push(this as unknown as Record<string, unknown>);
      return this;
    }
    static async findById(_id: string) {
      return store.doc;
    }
  }
  return { default: NameVerify };
});

const mail = vi.hoisted(() => ({
  verification: [] as unknown[][],
  confirmed: [] as unknown[][],
}));

vi.mock("@/utils/mail/nameMail", () => ({
  sendNameVerificationEmail: (...args: unknown[]) => {
    mail.verification.push(args);
  },
  sendConfirmedVerificationEmail: (...args: unknown[]) => {
    mail.confirmed.push(args);
  },
}));

import { createNameVerify, getVerifyName, sendProofMail } from "./nameActions";
import { createAccessToken } from "@/lib/accessToken";
import { substringHashOf } from "@/lib/proofVerification";

// --- helpers ----------------------------------------------------------------

const EMPLOYER = "employer@example.com";
const CANDIDATE = "candidate@example.com";
const REQUEST_ID = "req123";

function signInAs(email: string | null) {
  clerk.userId = email ? "user_" + email : null;
  clerk.email = email;
}

function existingRequest(overrides: Record<string, unknown> = {}) {
  store.doc = {
    _id: REQUEST_ID,
    email: EMPLOYER,
    recieverEmail: CANDIDATE,
    proverName: "Abhishek",
    isVerified: false,
    async save() {
      store.saved.push(this as unknown as Record<string, unknown>);
      return this;
    },
    ...overrides,
  };
  return store.doc;
}

/** An SP1-shaped proof whose public values claim `substring` matched. */
function proofFor(substring: string, matches = true) {
  const words: number[][] = [];
  const boolWord = new Array(32).fill(0);
  boolWord[31] = matches ? 1 : 0;
  words.push(boolWord, new Array(32).fill(0), new Array(32).fill(0));

  const hashHex = substringHashOf(substring);
  const hashWord: number[] = [];
  for (let i = 0; i < 32; i++) {
    hashWord.push(parseInt(hashHex.slice(i * 2, i * 2 + 2), 16));
  }
  words.push(hashWord, new Array(32).fill(0));

  return { public_values: { buffer: { data: words.flat() } } };
}

/** Makes the prover accept or reject whatever it is sent. */
function proverSays(valid: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ valid, error: valid ? null : "bad proof" }),
    }))
  );
}

beforeEach(() => {
  process.env.ACCESS_TOKEN_SECRET = "c".repeat(64);
  process.env.NEXT_PUBLIC_PROVER_URL = "http://prover.test";
  store.doc = null;
  store.saved = [];
  mail.verification = [];
  mail.confirmed = [];
  signInAs(null);
  (globalThis as { __rateBuckets?: Map<string, unknown> }).__rateBuckets?.clear();
  proverSays(true);
});

// --- reading a request ------------------------------------------------------

describe("getVerifyName", () => {
  it("refuses an anonymous caller with no token", async () => {
    existingRequest();
    const res = await getVerifyName(REQUEST_ID);

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/signed in/i);
  });

  it("allows the employer who raised it", async () => {
    existingRequest();
    signInAs(EMPLOYER);

    expect((await getVerifyName(REQUEST_ID)).success).toBe(true);
  });

  it("allows the candidate it was sent to", async () => {
    existingRequest();
    signInAs(CANDIDATE);

    expect((await getVerifyName(REQUEST_ID)).success).toBe(true);
  });

  it("refuses a signed-in stranger", async () => {
    existingRequest();
    signInAs("stranger@example.com");

    const res = await getVerifyName(REQUEST_ID);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/do not have access/i);
  });

  it("allows a valid link token with no session at all", async () => {
    existingRequest();
    const token = createAccessToken("name", REQUEST_ID, CANDIDATE);

    expect((await getVerifyName(REQUEST_ID, token)).success).toBe(true);
  });

  it("refuses a token minted for a different request", async () => {
    existingRequest();
    const token = createAccessToken("name", "some-other-request", CANDIDATE);

    const res = await getVerifyName(REQUEST_ID, token);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/different request/i);
  });

  it("refuses a token whose recipient no longer matches the record", async () => {
    existingRequest({ recieverEmail: "someone-else@example.com" });
    const token = createAccessToken("name", REQUEST_ID, CANDIDATE);

    expect((await getVerifyName(REQUEST_ID, token)).success).toBe(false);
  });
});

// --- submitting a proof -----------------------------------------------------

describe("sendProofMail", () => {
  it("refuses an anonymous caller", async () => {
    existingRequest();
    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(res.success).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("accepts a valid proof about the requested name", async () => {
    const doc = existingRequest();
    signInAs(CANDIDATE);

    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(res.success).toBe(true);
    expect(doc.isVerified).toBe(true);
    expect(store.saved).toHaveLength(1);
  });

  it("rejects a proof the prover says is invalid", async () => {
    const doc = existingRequest();
    signInAs(CANDIDATE);
    proverSays(false);

    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(res.success).toBe(false);
    expect(doc.isVerified).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("rejects a valid proof that is about a different value", async () => {
    // The core binding: the proof must concern this request's prover name.
    const doc = existingRequest();
    signInAs(CANDIDATE);

    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Someone Else"));

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/different value/i);
    expect(doc.isVerified).toBe(false);
  });

  it("rejects a proof reporting that the document did not match", async () => {
    existingRequest();
    signInAs(CANDIDATE);

    const res = await sendProofMail(
      REQUEST_ID,
      "PEM",
      proofFor("Abhishek", false)
    );

    expect(res.success).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("rejects the proof when the prover cannot be reached", async () => {
    existingRequest();
    signInAs(CANDIDATE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/unreachable/i);
  });

  it("will not re-verify a completed request", async () => {
    existingRequest({ isVerified: true });
    signInAs(CANDIDATE);

    const res = await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/already completed/i);
  });

  it("emails the addresses on the record, not anything the caller supplies", async () => {
    // The action takes no recipient argument, so the mail account cannot be
    // used to send to an arbitrary address.
    existingRequest();
    signInAs(CANDIDATE);

    await sendProofMail(REQUEST_ID, "PEM", proofFor("Abhishek"));

    expect(mail.confirmed).toHaveLength(1);
    expect(mail.confirmed[0][0]).toBe(EMPLOYER);
    expect(mail.confirmed[0][1]).toBe(CANDIDATE);
  });
});

// --- creating a request -----------------------------------------------------

describe("createNameVerify", () => {
  it("refuses an anonymous caller", async () => {
    expect((await createNameVerify("Abhishek", CANDIDATE)).success).toBe(false);
  });

  it("attributes the request to the session, not to an argument", async () => {
    signInAs(EMPLOYER);

    const res = await createNameVerify("Abhishek", CANDIDATE);

    expect(res.success).toBe(true);
    expect(store.saved[0].email).toBe(EMPLOYER);
    expect(store.saved[0].recieverEmail).toBe(CANDIDATE);
  });

  it("normalises the recipient address", async () => {
    signInAs(EMPLOYER);
    await createNameVerify("Abhishek", "  Candidate@Example.COM  ");

    expect(store.saved[0].recieverEmail).toBe(CANDIDATE);
  });

  it("rejects a malformed recipient address", async () => {
    signInAs(EMPLOYER);

    const res = await createNameVerify("Abhishek", "not-an-email");
    expect(res.success).toBe(false);
    expect(store.saved).toHaveLength(0);
  });

  it("rate limits repeated requests from the same caller", async () => {
    signInAs(EMPLOYER);

    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push(await createNameVerify("Abhishek", CANDIDATE));
    }

    expect(results.filter((r) => r.success)).toHaveLength(10);
    expect(results[11].message).toMatch(/too many requests/i);
  });
});
