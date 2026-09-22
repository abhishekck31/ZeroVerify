"use server";

import type { Model } from "mongoose";
import connectToDB from "@/utils/connectToDb";
import AcademicVerify from "@/models/academicModel";
import NameVerify from "@/models/nameModel";
import PanVerify from "@/models/panModel";
import { requireCaller, toActionError } from "@/lib/authz";

/**
 * Dashboard queries.
 *
 * These used to take the address to search for as an argument. Because server
 * actions are public endpoints, anyone could call them with somebody else's
 * address and read that person's PAN and academic records. The address is now
 * taken from the Clerk session, so a caller can only ever see their own rows.
 */
async function dashboardFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  label: string
) {
  try {
    const caller = await requireCaller();

    await connectToDB();
    const [recievedVerificationsRequest, sentVerificationsRequest] =
      await Promise.all([
        model.find({ recieverEmail: caller.email }).sort({ createdAt: -1 }),
        model.find({ email: caller.email }).sort({ createdAt: -1 }),
      ]);

    return {
      success: true as const,
      message: "Data fetched successfully",
      data: { recievedVerificationsRequest, sentVerificationsRequest },
    };
  } catch (err) {
    return toActionError(err, `Could not load your ${label} requests.`);
  }
}

export async function getNameDashboardData() {
  return dashboardFor(NameVerify, "name verification");
}

export async function getPanDashboardData() {
  return dashboardFor(PanVerify, "PAN verification");
}

export async function getAcademicDashboardData() {
  return dashboardFor(AcademicVerify, "academic verification");
}
