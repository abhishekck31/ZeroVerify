import { describe, expect, it } from "vitest";
import {
  asProofObject,
  decodePublicValues,
  ProofRejected,
  substringHashOf,
} from "./proofVerification";

/** Builds an SP1-shaped envelope around an encoded PublicValuesStruct. */
function envelope(opts: {
  matches: boolean;
  substring?: string;
  extraBytes?: number;
}) {
  const words: number[][] = [];

  const boolWord = new Array(32).fill(0);
  boolWord[31] = opts.matches ? 1 : 0;
  words.push(boolWord);

  words.push(new Array(32).fill(0x11)); // messageDigestHash
  words.push(new Array(32).fill(0x22)); // signerKeyHash

  const hashHex = substringHashOf(opts.substring ?? "");
  const substringWord = [];
  for (let i = 0; i < 32; i++) {
    substringWord.push(parseInt(hashHex.slice(i * 2, i * 2 + 2), 16));
  }
  words.push(substringWord);

  words.push(new Array(32).fill(0x44)); // nullifier

  const data = words.flat();
  if (opts.extraBytes) data.push(...new Array(opts.extraBytes).fill(0));

  return { public_values: { buffer: { data } } };
}

describe("substringHashOf", () => {
  it("computes Ethereum keccak256, not NIST SHA3", () => {
    expect(substringHashOf("")).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
  });

  it("is sensitive to the exact value", () => {
    expect(substringHashOf("Abhishek")).not.toBe(substringHashOf("abhishek"));
  });
});

describe("decodePublicValues", () => {
  it("reads the committed struct", () => {
    const values = decodePublicValues(envelope({ matches: true, substring: "Abhishek" }));

    expect(values.substringMatches).toBe(true);
    expect(values.substringHash).toBe(substringHashOf("Abhishek"));
    expect(values.messageDigestHash).toBe("11".repeat(32));
    expect(values.signerKeyHash).toBe("22".repeat(32));
    expect(values.nullifier).toBe("44".repeat(32));
  });

  it("reads a false match", () => {
    expect(decodePublicValues(envelope({ matches: false })).substringMatches).toBe(false);
  });

  it("tolerates trailing bytes", () => {
    const values = decodePublicValues(
      envelope({ matches: true, substring: "x", extraBytes: 64 })
    );
    expect(values.substringHash).toBe(substringHashOf("x"));
  });

  it("rejects truncated public values", () => {
    expect(() =>
      decodePublicValues({ public_values: { buffer: { data: [1, 2, 3] } } })
    ).toThrow(ProofRejected);
  });

  it("rejects an envelope with no public values", () => {
    expect(() => decodePublicValues({ proof: {} })).toThrow(ProofRejected);
  });
});

describe("asProofObject", () => {
  it("passes an object through", () => {
    const o = { a: 1 };
    expect(asProofObject(o)).toBe(o);
  });

  it("parses a JSON string", () => {
    expect(asProofObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("rejects malformed JSON", () => {
    expect(() => asProofObject("{not json")).toThrow(ProofRejected);
  });
});
