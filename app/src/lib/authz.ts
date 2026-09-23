import { auth, currentUser } from "@clerk/nextjs/server";
import { AccessTokenError, verifyAccessToken } from "./accessToken";

/**
 * Authorization helpers for server actions.
 *
 * Server actions are public HTTP endpoints: anything a client passes can be
 * forged. Identity therefore has to come from the Clerk session on the server,
 * never from an argument, and the caller's email is the key every verification
 * record is scoped by.
 */

export class AuthError extends Error {}

export interface Caller {
  userId: string;
  email: string;
}

/** Resolves the signed-in caller, or throws if there is no valid session. */
export async function requireCaller(): Promise<Caller> {
  const { userId } = await auth();
  if (!userId) throw new AuthError("You must be signed in to do that.");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) throw new AuthError("Your account has no primary email address.");

  return { userId, email: email.toLowerCase() };
}

/**
 * Confirms the caller is a party to this verification request.
 *
 * `email` is the employer who raised the request and `recieverEmail` the
 * candidate who answers it; nobody else may read it or write a result to it.
 */
export function assertParticipant(
  record: { email?: string; recieverEmail?: string },
  caller: Caller
): void {
  const parties = [record.email, record.recieverEmail]
    .filter(Boolean)
    .map((e) => String(e).toLowerCase());

  if (!parties.includes(caller.email)) {
    throw new AuthError("You do not have access to this verification request.");
  }
}

/**
 * How a caller proved they may act on a request: either a signed-in session,
 * or a capability token from the emailed link.
 */
export type Access =
  | { via: "session"; caller: Caller }
  | { via: "token"; recipient: string };

/**
 * Resolves access to one request.
 *
 * A valid token from the link is accepted on its own, so a candidate needs no
 * account; otherwise a session is required and the record still has to name
 * the caller (checked by {@link assertAccess} once it is loaded).
 */
export async function resolveAccess(
  kind: string,
  id: string,
  token?: string
): Promise<Access> {
  if (token) {
    // Token failures are reported as-is: "this link has expired" is more use
    // than "please sign in" to someone who followed a link from their inbox.
    const payload = verifyAccessToken(token, kind, id);
    return { via: "token", recipient: payload.to };
  }
  return { via: "session", caller: await requireCaller() };
}

/** Confirms the resolved access actually covers this record. */
export function assertAccess(
  access: Access,
  record: { email?: string; recieverEmail?: string }
): void {
  if (access.via === "session") {
    assertParticipant(record, access.caller);
    return;
  }

  // The token is already bound to this request id by its signature; also
  // require that the address it was issued to is still the one on record.
  const recipient = (record.recieverEmail ?? "").toLowerCase();
  if (recipient !== access.recipient) {
    throw new AuthError("This link is no longer valid for this request.");
  }
}

/** A stable rate-limit key for either kind of access. */
export function accessKey(access: Access, requestId: string): string {
  return access.via === "session" ? access.caller.email : "link:" + requestId;
}

/** Shape every action returns, so callers can keep using `result.success`. */
export type ActionResult<T = undefined> =
  | { success: true; message: string; data?: T }
  | { success: false; message: string };

/**
 * Converts a thrown error into an action result.
 *
 * Authorization failures are safe to show; anything else is logged server side
 * and reported generically so internal details do not reach the client.
 */
export function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof AuthError || err instanceof AccessTokenError) {
    return { success: false, message: err.message };
  }
  console.error(fallback, err);
  return { success: false, message: fallback };
}
