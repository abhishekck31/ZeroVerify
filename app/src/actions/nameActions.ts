/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";
import connectToDB from "@/utils/connectToDb";
import NameVerify from "@/models/nameModel";
import {
  accessKey,
  assertAccess,
  requireCaller,
  resolveAccess,
  toActionError,
} from "@/lib/authz";
import { consume, LIMITS } from "@/lib/rateLimit";
import {
  asProofObject,
  ProofRejected,
  verifyProofFor,
} from "@/lib/proofVerification";

import {
  sendNameVerificationEmail,
  sendConfirmedVerificationEmail,
} from "@/utils/mail/nameMail";

/**
 * Raises a name verification request. The requester is the signed-in caller;
 * their address is taken from the session rather than an argument so it cannot
 * be spoofed.
 */
export async function createNameVerify(name: string, recieverEmail: string) {
  try {
    const caller = await requireCaller();
    consume(`createNameVerify:${caller.email}`, LIMITS.createRequest);

    const candidate = recieverEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) {
      return { success: false as const, message: "That email address is not valid." };
    }

    await connectToDB();
    const newNameVerify = new NameVerify({
      proverName: name,
      email: caller.email,
      recieverEmail: candidate,
    });
    await newNameVerify.save();

    await sendNameVerificationEmail(
      candidate,
      caller.email,
      name,
      newNameVerify._id
    );
    return { success: true as const, message: "Name Verify created successfully" };
  } catch (err) {
    return toActionError(err, "Could not create the verification request.");
  }
}

/** Reads one request. Only the employer and the candidate on it may do so. */
export async function getVerifyName(id: string, token?: string) {
  try {
    const access = await resolveAccess("name", id, token);

    await connectToDB();
    const nameVerify = await NameVerify.findById(id);
    if (!nameVerify) {
      return { success: false as const, message: "Name Verify not found" };
    }
    assertAccess(access, nameVerify);

    return {
      success: true as const,
      message: "Name Verify fetched successfully",
      data: nameVerify,
    };
  } catch (err) {
    return toActionError(err, "Could not load the verification request.");
  }
}

/**
 * Records a proof against a request and notifies the employer.
 *
 * Recipient and prover name are read from the stored record: taking them from
 * the caller would let anyone send mail from this account to any address, and
 * let them label someone else's verification with arbitrary text.
 */
export async function sendProofMail(
  id: string,
  publicKeyPEM: string,
  proofData: any,
  token?: string
) {
  try {
    const access = await resolveAccess("name", id, token);
    consume(`sendProofMail:${accessKey(access, id)}`, LIMITS.submitProof);

    await connectToDB();
    const nameVerify = await NameVerify.findById(id);
    if (!nameVerify) {
      return { success: false as const, message: "Name Verify not found" };
    }
    assertAccess(access, nameVerify);

    if (nameVerify.isVerified) {
      return { success: false as const, message: "This request is already completed." };
    }

    // Check the proof before trusting it: it must be cryptographically valid
    // and must be about this request's prover name, not some other string.
    const proof = asProofObject(proofData);
    await verifyProofFor(proof, nameVerify.proverName, "name");

    nameVerify.snark = proofData;
    nameVerify.isVerified = true;
    nameVerify.signature = publicKeyPEM;
    await nameVerify.save();

    await sendConfirmedVerificationEmail(
      nameVerify.email,
      nameVerify.recieverEmail,
      nameVerify.proverName,
      nameVerify._id
    );
    return { success: true as const, message: "Proof mail sent successfully" };
  } catch (err) {
    if (err instanceof ProofRejected) {
      return { success: false as const, message: err.message };
    }
    return toActionError(err, "Could not submit the proof.");
  }
}
