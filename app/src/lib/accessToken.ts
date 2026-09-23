import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Capability tokens for verification links.
 *
 * A candidate is usually an outsider to the employer's account, so requiring
 * them to hold a Clerk account on exactly the address the employer typed made
 * a typo unrecoverable and forced a signup before they could respond at all.
 * The emailed link therefore carries a signed, expiring token that authorises
 * that one request - the same shape as a password-reset link.
 *
 * The token grants access to a single request and nothing else. Employer-side
 * access still goes through the session.
 */

const SEPARATOR = ".";

/** How long an emailed link stays usable. */
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AccessTokenError extends Error {}

export interface AccessTokenPayload {
  /** Which verification flow this token is for. */
  kind: string;
  /** The request it authorises. */
  id: string;
  /** The address the link was sent to, so the token stays bound to it. */
  to: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

function secret(): string {
  const value = process.env.ACCESS_TOKEN_SECRET;
  if (!value || value.length < 32) {
    // Fail closed: a weak or missing secret would make tokens forgeable.
    throw new AccessTokenError(
      "ACCESS_TOKEN_SECRET is missing or too short (needs at least 32 characters)."
    );
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", secret()).update(body).digest());
}

/** Mints a token authorising one request until `exp`. */
export function createAccessToken(
  kind: string,
  id: string,
  to: string,
  ttlMs: number = ACCESS_TOKEN_TTL_MS
): string {
  const payload: AccessTokenPayload = {
    kind,
    id,
    to: to.toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const body = base64url(JSON.stringify(payload));
  return body + SEPARATOR + sign(body);
}

/**
 * Checks a token and returns its payload.
 *
 * Throws {@link AccessTokenError} when the signature does not match, the token
 * has expired, or it authorises a different request than the one being opened.
 */
export function verifyAccessToken(
  token: string,
  expectedKind: string,
  expectedId: string
): AccessTokenPayload {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) {
    throw new AccessTokenError("This link is malformed.");
  }

  const [body, signature] = parts;

  const expected = fromBase64url(sign(body));
  const provided = fromBase64url(signature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    throw new AccessTokenError("This link is not valid.");
  }

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8"));
  } catch {
    throw new AccessTokenError("This link is malformed.");
  }

  if (payload.kind !== expectedKind || payload.id !== expectedId) {
    // A correctly signed token for a different request must not work here.
    throw new AccessTokenError("This link is for a different request.");
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    throw new AccessTokenError(
      "This link has expired. Ask the sender to issue a new request."
    );
  }

  return payload;
}
