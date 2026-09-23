"use server";

import connectToDB from "@/utils/connectToDb";
import AcademicVerify from "@/models/academicModel";
import NameVerify from "@/models/nameModel";
import PanVerify from "@/models/panModel";
import { requireCaller, toActionError } from "@/lib/authz";

export type RequestKind = "name" | "pan" | "academic";

export interface OverviewRequest {
  id: string;
  kind: RequestKind;
  /** Who raised the request. */
  email: string;
  /** Who was asked to answer it. */
  recieverEmail: string;
  proverName: string;
  /** The extra fields this kind carries, ready to display. */
  details: { label: string; value: string }[];
  isVerified: boolean;
  createdAt: string;
  /** True when the signed-in caller raised this request. */
  sent: boolean;
}

interface Row {
  _id: unknown;
  email?: string;
  recieverEmail?: string;
  proverName?: string;
  proverPanId?: string;
  proverAcademicId?: string;
  proverInstitute?: string;
  proverCGPA?: string;
  isVerified?: boolean;
  createdAt?: Date;
}

function detailsFor(kind: RequestKind, row: Row) {
  if (kind === "pan") {
    return [{ label: "PAN", value: row.proverPanId ?? "" }];
  }
  if (kind === "academic") {
    return [
      { label: "ID", value: row.proverAcademicId ?? "" },
      { label: "Institute", value: row.proverInstitute ?? "" },
      { label: "CGPA", value: row.proverCGPA ?? "" },
    ];
  }
  return [];
}

function toOverview(kind: RequestKind, row: Row, callerEmail: string): OverviewRequest {
  return {
    id: String(row._id),
    kind,
    email: row.email ?? "",
    recieverEmail: row.recieverEmail ?? "",
    proverName: row.proverName ?? "",
    details: detailsFor(kind, row),
    isVerified: Boolean(row.isVerified),
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    sent: (row.email ?? "").toLowerCase() === callerEmail,
  };
}

/**
 * Every verification request the caller is a party to, across all three types,
 * newest first.
 *
 * Like the per-type dashboards, the address is taken from the session rather
 * than an argument, so a caller only ever sees their own rows.
 */
export async function getOverview() {
  try {
    const caller = await requireCaller();
    await connectToDB();

    const mine = { $or: [{ email: caller.email }, { recieverEmail: caller.email }] };

    const [names, pans, academics] = await Promise.all([
      NameVerify.find(mine).sort({ createdAt: -1 }).lean(),
      PanVerify.find(mine).sort({ createdAt: -1 }).lean(),
      AcademicVerify.find(mine).sort({ createdAt: -1 }).lean(),
    ]);

    const requests: OverviewRequest[] = [
      ...(names as Row[]).map((r) => toOverview("name", r, caller.email)),
      ...(pans as Row[]).map((r) => toOverview("pan", r, caller.email)),
      ...(academics as Row[]).map((r) => toOverview("academic", r, caller.email)),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      success: true as const,
      message: "Overview fetched successfully",
      data: {
        requests,
        stats: {
          total: requests.length,
          verified: requests.filter((r) => r.isVerified).length,
          pending: requests.filter((r) => !r.isVerified).length,
          sent: requests.filter((r) => r.sent).length,
          received: requests.filter((r) => !r.sent).length,
        },
      },
    };
  } catch (err) {
    return toActionError(err, "Could not load your dashboard.");
  }
}
