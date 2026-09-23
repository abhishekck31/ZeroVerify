import { beforeEach, describe, expect, it } from "vitest";
import { consume } from "./rateLimit";
import { AuthError } from "./authz";

// The limiter keeps its buckets on globalThis so they survive module reuse;
// clear them between tests to keep each case independent.
beforeEach(() => {
  (globalThis as { __rateBuckets?: Map<string, unknown> }).__rateBuckets?.clear();
});

const limit = { max: 3, windowMs: 60_000 };

describe("consume", () => {
  it("allows calls up to the limit", () => {
    for (let i = 0; i < limit.max; i++) {
      expect(() => consume("alice", limit)).not.toThrow();
    }
  });

  it("blocks the call that exceeds the limit", () => {
    for (let i = 0; i < limit.max; i++) consume("alice", limit);
    expect(() => consume("alice", limit)).toThrow(AuthError);
  });

  it("tells the caller roughly when to retry", () => {
    for (let i = 0; i < limit.max; i++) consume("alice", limit);
    expect(() => consume("alice", limit)).toThrow(/try again in about \d+ minute/);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < limit.max; i++) consume("alice", limit);
    // Bob must not be affected by Alice spending her allowance.
    expect(() => consume("bob", limit)).not.toThrow();
  });

  it("starts a fresh window once the old one has passed", () => {
    // A real window, so the limit cannot lapse on its own mid-test.
    const one = { max: 1, windowMs: 60_000 };
    consume("carol", one);
    expect(() => consume("carol", one)).toThrow(AuthError);

    // Expire the window explicitly rather than waiting for wall-clock time.
    const buckets = (globalThis as { __rateBuckets?: Map<string, { resetAt: number }> })
      .__rateBuckets!;
    buckets.get("carol")!.resetAt = Date.now() - 1;

    expect(() => consume("carol", one)).not.toThrow();
    // ...and the fresh window is enforced in turn.
    expect(() => consume("carol", one)).toThrow(AuthError);
  });
});
