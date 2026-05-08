import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";

/**
 * Shared shell helpers for GSTR portal-JSON endpoints.
 *
 * Every GSTR portal route (gstr1, gstr3b, gstr9, …) needs the same two
 * pieces around the actual compute:
 *
 *   1. fetch the org's GSTIN and refuse with 400 if missing
 *   2. wrap the payload in a JSON response, optionally with
 *      Content-Disposition: attachment so the browser saves the file
 *
 * Extracting these out keeps the endpoint files thin and consistent.
 */

export type GstinLookup =
  | { ok: true; gstin: string }
  | { ok: false; response: NextResponse };

/** Return the org's GSTIN, or a ready-to-return 400 if it isn't configured. */
export async function requireOrgGstin(orgId: string): Promise<GstinLookup> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { gstNo: true },
  });
  if (!org?.gstNo) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Organization does not have a GSTIN configured. Add it in Settings → Organization.",
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, gstin: org.gstNo };
}

/**
 * Wrap a portal-JSON payload in either a regular JSON response or a
 * Content-Disposition attachment download (when wantsDownload=true).
 */
export function respondPortalJson(
  payload: unknown,
  { wantsDownload, filename }: { wantsDownload: boolean; filename: string }
): NextResponse {
  if (!wantsDownload) return NextResponse.json(payload);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Format a (return code, GSTIN, MMYYYY) trio into the standard portal filename. */
export function monthlyPortalFilename(
  returnCode: "GSTR1" | "GSTR3B",
  gstin: string,
  periodStart: Date
): string {
  const period = `${String(periodStart.getUTCMonth() + 1).padStart(2, "0")}${periodStart.getUTCFullYear()}`;
  return `${returnCode}_${gstin.toUpperCase()}_${period}.json`;
}
