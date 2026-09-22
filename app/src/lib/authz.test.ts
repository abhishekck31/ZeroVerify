import { describe, expect, it } from "vitest";
import { assertParticipant, AuthError, toActionError } from "./authz";

const caller = { userId: "user_1", email: "employer@example.com" };
const record = {
  email: "employer@example.com",
  recieverEmail: "candidate@example.com",
};

describe("assertParticipant", () => {
  it("allows the employer who raised the request", () => {
    expect(() => assertParticipant(record, caller)).not.toThrow();
  });

  it("allows the candidate answering it", () => {
    expect(() =>
      assertParticipant(record, { userId: "u2", email: "candidate@example.com" })
    ).not.toThrow();
  });

  it("rejects anyone else", () => {
    expect(() =>
      assertParticipant(record, { userId: "u3", email: "stranger@example.com" })
    ).toThrow(AuthError);
  });

  it("compares addresses case-insensitively", () => {
    expect(() =>
      assertParticipant(
        { email: "Employer@Example.com", recieverEmail: "x@y.z" },
        caller
      )
    ).not.toThrow();
  });

  it("rejects when the record names nobody", () => {
    expect(() => assertParticipant({}, caller)).toThrow(AuthError);
  });
});

describe("toActionError", () => {
  it("passes an authorization message through to the client", () => {
    const result = toActionError(new AuthError("You must be signed in."), "fallback");
    expect(result).toEqual({ success: false, message: "You must be signed in." });
  });

  it("hides internal errors behind the fallback", () => {
    const leaky = new Error("MongoServerError: auth failed for user admin");
    const result = toActionError(leaky, "Could not load the request.");
    expect(result.message).toBe("Could not load the request.");
    expect(JSON.stringify(result)).not.toContain("MongoServerError");
  });
});
