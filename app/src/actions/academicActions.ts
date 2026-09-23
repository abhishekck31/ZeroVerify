/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";
import connectToDB from "@/utils/connectToDb";
import AcademicVerify from "@/models/academicModel";
import {
  assertParticipant,
  requireCaller,
  toActionError,
} from "@/lib/authz";
import { consume, LIMITS } from "@/lib/rateLimit";
import {
  asProofObject,
  ProofRejected,
  verifyProofFor,
} from "@/lib/proofVerification";
import {
  sendAcademicVerificationEmail,
  sendConfirmedAcademicVerificationEmail,
} from "@/utils/mail/academicMail";

/** Raises an academic verification request on behalf of the signed-in caller. */
export async function createAcademicVerify(
  proverName: string,
  proverAcademicId: string,
  proverInstitute: string,
  proverCGPA: string,
  recieverEmail: string
) {
  try {
    const caller = await requireCaller();
    consume(`createAcademicVerify:${caller.email}`, LIMITS.createRequest);

    const candidate = recieverEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) {
      return { success: false as const, message: "That email address is not valid." };
    }

    await connectToDB();
    const newAcademicVerify = new AcademicVerify({
      proverName,
      proverAcademicId,
      proverInstitute,
      proverCGPA,
      email: caller.email,
      recieverEmail: candidate,
    });
    await newAcademicVerify.save();

    await sendAcademicVerificationEmail(
      candidate,
      caller.email,
      proverName,
      proverAcademicId,
      proverInstitute,
      proverCGPA,
      newAcademicVerify._id
    );
    return { success: true as const, message: "Academic Verify created successfully" };
  } catch (err) {
    return toActionError(err, "Could not create the verification request.");
  }
}

/** Reads one request. Only the employer and the candidate on it may do so. */
export async function getVerifyAcademic(id: string) {
  try {
    const caller = await requireCaller();

    await connectToDB();
    const academicVerify = await AcademicVerify.findById(id);
    if (!academicVerify) {
      return { success: false as const, message: "Academic Verify not found" };
    }
    assertParticipant(academicVerify, caller);

    return {
      success: true as const,
      message: "Academic Verify fetched successfully",
      data: academicVerify,
    };
  } catch (err) {
    return toActionError(err, "Could not load the verification request.");
  }
}

/** Records a proof against a request and notifies the employer. */
export async function sendAcademicProofMail(
  id: string,
  publicKeyPEM: string,
  proofData: any
) {
  try {
    const caller = await requireCaller();
    consume(`sendAcademicProofMail:${caller.email}`, LIMITS.submitProof);

    await connectToDB();
    const academicVerify = await AcademicVerify.findById(id);
    if (!academicVerify) {
      return { success: false as const, message: "Academic Verify not found" };
    }
    assertParticipant(academicVerify, caller);

    if (academicVerify.isVerified) {
      return { success: false as const, message: "This request is already completed." };
    }

    // Each field is proved separately; every one is checked against the value
    // stored on this request.
    const submitted = asProofObject(proofData) as {
      nameProof?: unknown;
      academicIdProof?: unknown;
      instituteProof?: unknown;
      cgpaProof?: unknown;
    };
    await verifyProofFor(submitted?.nameProof, academicVerify.proverName, "name");
    await verifyProofFor(
      submitted?.academicIdProof,
      academicVerify.proverAcademicId,
      "academic ID"
    );
    await verifyProofFor(
      submitted?.instituteProof,
      academicVerify.proverInstitute,
      "institute"
    );
    await verifyProofFor(submitted?.cgpaProof, academicVerify.proverCGPA, "CGPA");

    academicVerify.snark = proofData;
    academicVerify.isVerified = true;
    academicVerify.signature = publicKeyPEM;
    await academicVerify.save();

    await sendConfirmedAcademicVerificationEmail(
      academicVerify.email,
      academicVerify.recieverEmail,
      academicVerify.proverName,
      academicVerify.proverAcademicId,
      academicVerify.proverInstitute,
      academicVerify.proverCGPA,
      academicVerify._id
    );
    return { success: true as const, message: "Academic proof mail sent successfully" };
  } catch (err) {
    if (err instanceof ProofRejected) {
      return { success: false as const, message: err.message };
    }
    return toActionError(err, "Could not submit the proof.");
  }
}
