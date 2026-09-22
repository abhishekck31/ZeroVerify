/**
 * Client for the Rust/SP1 prover service (circuits/script/src/bin/prover.rs).
 *
 * The endpoint used to be hardcoded to http://localhost:3001 in every verify
 * page, which meant a deployed build always pointed at the visitor's own
 * machine. It now comes from NEXT_PUBLIC_PROVER_URL so a hosted frontend can
 * be pointed at a hosted prover.
 */

export const PROVER_URL = (
  process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:3001"
).replace(/\/$/, "");

export interface ProveRequest {
  pdf_bytes: number[];
  page_number: number;
  offset: number;
  sub_string: string;
}

/**
 * Turns a failed prover call into something a user can act on.
 *
 * A browser `fetch` to a dead local port rejects with the bare message
 * "Failed to fetch", which tells the user nothing — so we name the service and
 * the URL that was actually tried.
 */
function unreachable(err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(detail)) {
    return new Error(
      `Cannot reach the prover service at ${PROVER_URL}. Start it with ` +
        `\`cd circuits/script && cargo run --release --bin prover\`.`
    );
  }
  return new Error(detail);
}

async function post(path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${PROVER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw unreachable(err);
  }

  if (!response.ok) {
    // The prover returns a plain-text reason on failure; surface it verbatim.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Prover returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`
    );
  }

  return response.json();
}

/** Generates a SNARK proof that `sub_string` appears in the signed PDF. */
export function generateProof(request: ProveRequest): Promise<unknown> {
  return post("/prove", request);
}

/** Asks the prover to check a previously generated proof. */
export function verifyProof(proof: unknown): Promise<unknown> {
  return post("/verify", proof);
}
