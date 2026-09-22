import { AuthError } from "./authz";

/**
 * Small fixed-window rate limiter for server actions.
 *
 * State lives in this process, so on a serverless host each instance keeps its
 * own counters and the effective limit is per instance rather than global. It
 * still blocks the obvious abuse — one client hammering request creation or
 * proof submission — and is deliberately dependency-free. Move the buckets to
 * Redis (Upstash) when a hard global guarantee is needed.
 */
type Bucket = { count: number; resetAt: number };

const buckets: Map<string, Bucket> = ((
  globalThis as { __rateBuckets?: Map<string, Bucket> }
).__rateBuckets ??= new Map());

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const LIMITS = {
  /** Creating verification requests: each one sends an email. */
  createRequest: { max: 10, windowMs: 60 * 60 * 1000 },
  /** Submitting a proof result: also sends an email. */
  submitProof: { max: 20, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, Limit>;

/**
 * Consumes one token for `key`, throwing once the window's allowance is spent.
 * Keys should be scoped per caller, e.g. `createRequest:alice@example.com`.
 */
export function consume(key: string, limit: Limit): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return;
  }

  if (bucket.count >= limit.max) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60000));
    throw new AuthError(
      `Too many requests. Please try again in about ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`
    );
  }

  bucket.count += 1;

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }
}
