/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";
import connectToDB from "@/utils/connectToDb";
import PanVerify from "@/models/panModel";
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
  sendNamePanVerificationEmail,
  sendConfirmedPanVerificationMail,
} from "@/utils/mail/panMail";

/** Raises a PAN verification request on behalf of the signed-in caller. */
export async function createPanVerify(
  proverName: string,
  proverPanId: string,
  recieverEmail: string
) {
  try {
    const caller = await requireCaller();
    consume(`createPanVerify:${caller.email}`, LIMITS.createRequest);

    const candidate = recieverEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) {
      return { success: false as const, message: "That email address is not valid." };
    }

    const pan = proverPanId.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      return {
        success: false as const,
        message: "That is not a valid PAN (expected five letters, four digits, one letter).",
      };
    }

    await connectToDB();
    const newPanVerify = new PanVerify({
      proverName,
      proverPanId: pan,
      email: caller.email,
      recieverEmail: candidate,
    });
    await newPanVerify.save();

    await sendNamePanVerificationEmail(
      candidate,
      caller.email,
      proverName,
      pan,
      newPanVerify._id
    );
    return { success: true as const, message: "Pan Verify created successfully" };
  } catch (err) {
    return toActionError(err, "Could not create the verification request.");
  }
}

/** Reads one request. Only the employer and the candidate on it may do so. */
export async function getVerifyPan(id: string, token?: string) {
  try {
    const access = await resolveAccess("pan", id, token);

    await connectToDB();
    const panVerify = await PanVerify.findById(id);
    if (!panVerify) {
      return { success: false as const, message: "Pan Verify not found" };
    }
    assertAccess(access, panVerify);

    return {
      success: true as const,
      message: "Pan Verify fetched successfully",
      data: panVerify,
    };
  } catch (err) {
    return toActionError(err, "Could not load the verification request.");
  }
}

/** Records a proof against a request and notifies the employer. */
export async function sendPanProofMail(
  id: string,
  publicKeyPEM: string,
  proofData: any,
  token?: string
) {
  try {
    const access = await resolveAccess("pan", id, token);
    consume(`sendPanProofMail:${accessKey(access, id)}`, LIMITS.submitProof);

    await connectToDB();
    const panVerify = await PanVerify.findById(id);
    if (!panVerify) {
      return { success: false as const, message: "Pan Verify not found" };
    }
    assertAccess(access, panVerify);

    if (panVerify.isVerified) {
      return { success: false as const, message: "This request is already completed." };
    }

    // Both halves are proved separately, so both are checked - against this
    // request's own name and PAN, not whatever the client claims they cover.
    const submitted = asProofObject(proofData) as {
      nameProof?: unknown;
      panProof?: unknown;
    };
    await verifyProofFor(submitted?.nameProof, panVerify.proverName, "name");
    await verifyProofFor(submitted?.panProof, panVerify.proverPanId, "PAN");

    panVerify.snark = proofData;
    panVerify.isVerified = true;
    panVerify.signature = publicKeyPEM;
    await panVerify.save();

    await sendConfirmedPanVerificationMail(
      panVerify.email,
      panVerify.recieverEmail,
      panVerify.proverName,
      panVerify.proverPanId,
      panVerify._id
    );
    return { success: true as const, message: "Proof mail sent successfully" };
  } catch (err) {
    if (err instanceof ProofRejected) {
      return { success: false as const, message: err.message };
    }
    return toActionError(err, "Could not submit the proof.");
  }
}
