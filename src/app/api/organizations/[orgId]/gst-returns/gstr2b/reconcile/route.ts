import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D, sum } from "@/backend/utils/money";
import {
  parseGstr2bJson,
  matchGstr2bToBills,
  type BillForReconciliation,
} from "@/backend/services/gst/gstr2b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/gst-returns/gstr2b/reconcile
 *
 * Multipart upload of a GSTN GSTR-2B JSON file (`file` field), or
 * raw JSON body with content-type `application/json`. Returns the
 * reconciliation result against the org's purchase register for the
 * 2B's filing period (rtnprd).
 *
 * Currently transient — results are computed on the fly and returned
 * in the response. Persistence (Gstr2bImport / Gstr2bRow tables) is a
 * follow-up; accountants can re-upload the same JSON to revisit.
 */
export const POST = withOrgAuth(async (request, { orgId, orgUser }) => {
  // Permission gate — and incidental rate-limit (a 50 MB JSON upload
  // is non-trivial to parse + match against the purchase register).
  if (!hasPermission(orgUser, "tax", "read")) {
    return forbidden("You don't have permission to run GSTR-2B reconciliation");
  }
  let json: string;
  try {
    const ctype = request.headers.get("content-type") ?? "";
    if (ctype.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return badRequest("Multipart upload must include a 'file' field");
      }
      if (file.size > 50 * 1024 * 1024) {
        return badRequest("File too large (max 50 MB)");
      }
      json = await file.text();
    } else if (ctype.includes("json")) {
      json = await request.text();
    } else {
      return badRequest(
        "Content-Type must be multipart/form-data (with 'file' field) or application/json"
      );
    }
  } catch (e) {
    return badRequest(`Failed to read upload: ${(e as Error).message}`);
  }

  if (!json.trim()) {
    return badRequest("Empty upload");
  }

  let parsed;
  try {
    parsed = parseGstr2bJson(json);
  } catch (e) {
    return badRequest((e as Error).message);
  }

  // The 2B period is in MMYYYY. Convert to a date range covering that
  // calendar month, then load the matching bills.
  const periodMatch = /^(\d{2})(\d{4})$/.exec(parsed.rtnprd);
  if (!periodMatch) {
    return badRequest(`Invalid rtnprd "${parsed.rtnprd}" — expected MMYYYY`);
  }
  const month = parseInt(periodMatch[1], 10);
  const year = parseInt(periodMatch[2], 10);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  try {
    const billsRaw = await prisma.bill.findMany({
      where: {
        organizationId: orgId,
        date: { gte: periodStart, lte: periodEnd },
        // Exclude DRAFT bills — they're not yet on the books.
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      select: {
        id: true,
        billNumber: true,
        vendorBillNo: true,
        date: true,
        totalAmount: true,
        party: { select: { gstNo: true, name: true } },
        items: {
          select: {
            igstAmount: true,
            cgstAmount: true,
            sgstAmount: true,
            cessAmount: true,
          },
        },
      },
    });

    const bills: BillForReconciliation[] = billsRaw.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      vendorBillNo: b.vendorBillNo,
      date: b.date,
      party: { gstNo: b.party.gstNo, name: b.party.name },
      totalAmount: b.totalAmount,
      igstTotal: sum(b.items.map((i) => D(i.igstAmount ?? 0))),
      cgstTotal: sum(b.items.map((i) => D(i.cgstAmount ?? 0))),
      sgstTotal: sum(b.items.map((i) => D(i.sgstAmount ?? 0))),
      cessTotal: sum(b.items.map((i) => D(i.cessAmount ?? 0))),
    }));

    const result = matchGstr2bToBills(parsed, bills);
    return NextResponse.json({
      ok: true,
      period: result.period,
      buyerGstin: parsed.gstin ?? null,
      supplierCount: parsed.suppliers.length,
      billsConsidered: bills.length,
      totals: result.totals,
      rows: result.rows,
    });
  } catch (error) {
    logger.error({ err: error }, "GSTR-2B reconciliation failed");
    return NextResponse.json(
      { error: "GSTR-2B reconciliation failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});
