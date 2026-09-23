import { keccak256 } from "js-sha3";

/**
 * Server-side checking of proofs submitted by clients.
 *
 * A proof arrives as opaque JSON from the browser, so accepting it on the
 * client's word would let any participant mark a request verified with
 * arbitrary data. Two things have to hold before a result is trusted:
 *
 *  1. the prover service accepts the proof as cryptographically valid, and
 *  2. the values the circuit committed to describe *this* request - the
 *     substring the employer asked about, and a successful match.
 *
 * Without (2), a valid proof about some other document or some other string
 * would still be accepted.
 */

/** Where the prover lives, from the server's point of view. */
const PROVER_URL = (
  process.env.PROVER_URL ||
  process.env.NEXT_PUBLIC_PROVER_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");

/** ABI-encoded PublicValuesStruct: a bool and four bytes32, 32 bytes each. */
const WORD = 32;
const EXPECTED_LEN = WORD * 5;

export class ProofRejected extends Error {}

export interface PublicValues {
  substringMatches: boolean;
  messageDigestHash: string;
  signerKeyHash: string;
  substringHash: string;
  nullifier: string;
}

/** keccak256 of a substring, matching what the circuit commits to. */
export function substringHashOf(value: string): string {
  return keccak256(new TextEncoder().encode(value));
}

function toBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[]);
  throw new ProofRejected("The proof carries no readable public values.");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pulls `public_values.buffer.data` out of an SP1 proof envelope. */
function publicValueBytes(proof: unknown): Uint8Array {
  const envelope = proof as {
    public_values?: { buffer?: { data?: unknown } };
  };
  const data = envelope?.public_values?.buffer?.data;
  if (data === undefined) {
    throw new ProofRejected("The proof is missing its public values.");
  }
  return toBytes(data);
}

/** Decodes the struct the circuit committed to. */
export function decodePublicValues(proof: unknown): PublicValues {
  const bytes = publicValueBytes(proof);
  if (bytes.length < EXPECTED_LEN) {
    throw new ProofRejected(
      `Public values are ${bytes.length} bytes; expected at least ${EXPECTED_LEN}.`
    );
  }

  const word = (i: number) => bytes.subarray(i * WORD, (i + 1) * WORD);

  // A Solidity bool is right-aligned in its word.
  const boolWord = word(0);
  const substringMatches = boolWord[WORD - 1] === 1;

  return {
    substringMatches,
    messageDigestHash: hex(word(1)),
    signerKeyHash: hex(word(2)),
    substringHash: hex(word(3)),
    nullifier: hex(word(4)),
  };
}

/** Asks the prover whether the proof is cryptographically valid. */
async function proverAcceptsProof(proof: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${PROVER_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    });
  } catch (err) {
    // Fail closed: if the proof cannot be checked, it is not accepted.
    throw new ProofRejected(
      `The proof could not be checked because the prover at ${PROVER_URL} is ` +
        `unreachable (${err instanceof Error ? err.message : String(err)}).`
    );
  }

  if (!response.ok) {
    throw new ProofRejected(`The prover rejected the proof (HTTP ${response.status}).`);
  }

  const result = (await response.json().catch(() => null)) as
    | { valid?: boolean; error?: string | null }
    | null;

  if (!result?.valid) {
    throw new ProofRejected(
      result?.error ? `Invalid proof: ${result.error}` : "The proof is not valid."
    );
  }
}

/**
 * Verifies one proof and confirms it is about `expectedSubstring`.
 *
 * Throws {@link ProofRejected} with a message safe to show the user.
 */
export async function verifyProofFor(
  proof: unknown,
  expectedSubstring: string,
  label: string
): Promise<PublicValues> {
  if (proof === null || proof === undefined) {
    throw new ProofRejected(`Missing the ${label} proof.`);
  }

  await proverAcceptsProof(proof);

  const values = decodePublicValues(proof);

  if (!values.substringMatches) {
    throw new ProofRejected(
      `The ${label} proof reports that the document does not contain the requested value.`
    );
  }

  const expected = substringHashOf(expectedSubstring);
  if (values.substringHash !== expected) {
    // The proof is valid, but about a different string than the one requested.
    throw new ProofRejected(
      `The ${label} proof is for a different value than the one this request asks about.`
    );
  }

  return values;
}

/** Parses a submitted payload that may arrive as a JSON string. */
export function asProofObject(submitted: unknown): unknown {
  if (typeof submitted !== "string") return submitted;
  try {
    return JSON.parse(submitted);
  } catch {
    throw new ProofRejected("The submitted proof is not valid JSON.");
  }
}
