import { auth, currentUser } from "@clerk/nextjs/server";

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
  if (err instanceof AuthError) {
    return { success: false, message: err.message };
  }
  console.error(fallback, err);
  return { success: false, message: fallback };
}
