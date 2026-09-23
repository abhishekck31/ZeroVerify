import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_TTL_MS,
  AccessTokenError,
  createAccessToken,
  verifyAccessToken,
} from "./accessToken";

const SECRET = "a".repeat(64);

beforeEach(() => {
  process.env.ACCESS_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  process.env.ACCESS_TOKEN_SECRET = SECRET;
});

describe("createAccessToken / verifyAccessToken", () => {
  it("round-trips a token for the request it was issued for", () => {
    const token = createAccessToken("name", "abc123", "Candidate@Example.com");
    const payload = verifyAccessToken(token, "name", "abc123");

    expect(payload.kind).toBe("name");
    expect(payload.id).toBe("abc123");
    expect(payload.to).toBe("candidate@example.com"); // normalised
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("rejects a token issued for a different request", () => {
    const token = createAccessToken("name", "abc123", "c@example.com");
    expect(() => verifyAccessToken(token, "name", "other")).toThrow(AccessTokenError);
  });

  it("rejects a token issued for a different verification type", () => {
    // A name token must not open the PAN request with the same id.
    const token = createAccessToken("name", "abc123", "c@example.com");
    expect(() => verifyAccessToken(token, "pan", "abc123")).toThrow(AccessTokenError);
  });

  it("rejects a tampered payload", () => {
    const token = createAccessToken("name", "abc123", "c@example.com");
    const [body, sig] = token.split(".");

    // Re-encode the payload with a different id, keeping the original signature.
    const decoded = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );
    decoded.id = "elevated";
    const forged =
      Buffer.from(JSON.stringify(decoded))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "") +
      "." +
      sig;

    expect(() => verifyAccessToken(forged, "name", "elevated")).toThrow(AccessTokenError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createAccessToken("name", "abc123", "c@example.com");
    process.env.ACCESS_TOKEN_SECRET = "b".repeat(64);
    expect(() => verifyAccessToken(token, "name", "abc123")).toThrow(AccessTokenError);
  });

  it("rejects an expired token", () => {
    const token = createAccessToken("name", "abc123", "c@example.com", -1000);
    expect(() => verifyAccessToken(token, "name", "abc123")).toThrow(/expired/i);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyAccessToken("not-a-token", "name", "abc123")).toThrow(
      AccessTokenError
    );
    expect(() => verifyAccessToken("a.b.c", "name", "abc123")).toThrow(AccessTokenError);
  });

  it("refuses to sign when the secret is missing or weak", () => {
    delete process.env.ACCESS_TOKEN_SECRET;
    expect(() => createAccessToken("name", "abc123", "c@example.com")).toThrow(
      AccessTokenError
    );

    process.env.ACCESS_TOKEN_SECRET = "short";
    expect(() => createAccessToken("name", "abc123", "c@example.com")).toThrow(
      /at least 32/
    );
  });

  it("defaults to a usable lifetime", () => {
    const token = createAccessToken("name", "abc123", "c@example.com");
    const payload = verifyAccessToken(token, "name", "abc123");
    const remaining = payload.exp - Date.now();

    expect(remaining).toBeGreaterThan(ACCESS_TOKEN_TTL_MS - 60_000);
    expect(remaining).toBeLessThanOrEqual(ACCESS_TOKEN_TTL_MS);
  });
});
