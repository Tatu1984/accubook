import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  buildForm16AQuarterly,
  quarterDateRange,
  type DeductionRow,
} from "@/backend/services/tax/form-16a";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/organizations/[orgId]/tds-deductions
 *
 * Lists or aggregates TDS deductions. Drives:
 *   - the TDS register report (raw rows),
 *   - Form 16A quarterly statements (aggregated by party + section),
 *   - 26AS reconciliation against the deductee.
 *
 * Query params:
 *   ?view=list          → returns paginated raw deduction rows
 *   ?view=form16a       → returns the Form 16A aggregator output
 *
 *   Filters (all optional, all views):
 *     ?fiscalYearId=...   restrict to one FY
 *     ?fy=2025-26         alternative — resolves the FY by name
 *     ?quarter=1..4       restrict to FY quarter (requires fy/fiscalYearId)
 *     ?partyId=...        restrict to one party
 *     ?section=194C       restrict to one section
 *
 *   List-only:
 *     ?page=1&limit=20    pagination (default page=1, limit=20)
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "list";

    // Resolve fiscal year by id or name.
    let fiscalYearId = searchParams.get("fiscalYearId");
    const fyLabel = searchParams.get("fy");
    let fyForRange: { name: string; startDate: Date; endDate: Date } | null = null;
    if (!fiscalYearId && fyLabel) {
      const fy = await prisma.fiscalYear.findFirst({
        where: { organizationId: orgId, name: fyLabel },
        select: { id: true, name: true, startDate: true, endDate: true },
      });
      if (!fy) {
        return NextResponse.json(
          { error: `Fiscal year "${fyLabel}" not found for this organization` },
          { status: 404 }
        );
      }
      fiscalYearId = fy.id;
      fyForRange = { name: fy.name, startDate: fy.startDate, endDate: fy.endDate };
    }

    const quarterParam = searchParams.get("quarter");
    let quarter: 1 | 2 | 3 | 4 | null = null;
    if (quarterParam) {
      const q = parseInt(quarterParam, 10);
      if (q < 1 || q > 4) {
        return NextResponse.json(
          { error: "quarter must be 1, 2, 3, or 4" },
          { status: 400 }
        );
      }
      quarter = q as 1 | 2 | 3 | 4;
    }

    const partyId = searchParams.get("partyId");
    const section = searchParams.get("section");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    if (partyId) where.partyId = partyId;
    if (section) where.section = section;

    if (quarter) {
      // Need an FY to resolve quarter dates.
      if (!fyForRange && fiscalYearId) {
        const fy = await prisma.fiscalYear.findUnique({
          where: { id: fiscalYearId },
          select: { name: true, startDate: true, endDate: true },
        });
        if (fy) fyForRange = fy;
      }
      if (!fyForRange) {
        return NextResponse.json(
          { error: "quarter filter requires fy or fiscalYearId" },
          { status: 400 }
        );
      }
      const { startDate, endDate } = quarterDateRange(fyForRange.name, quarter);
      where.deductedAt = { gte: startDate, lte: endDate };
    }

    if (view === "form16a") {
      if (!fyForRange || !quarter) {
        return NextResponse.json(
          { error: "form16a view requires fy + quarter" },
          { status: 400 }
        );
      }
      const rows = await prisma.tdsDeduction.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, panNo: true } },
        },
        orderBy: { deductedAt: "asc" },
      });
      const mapped: DeductionRow[] = rows.map((r) => ({
        partyId: r.partyId,
        partyName: r.party.name,
        partyPan: r.party.panNo,
        section: r.section,
        baseAmount: r.baseAmount,
        taxAmount: r.taxAmount,
        ratePercent: r.ratePercent,
        deductedAt: r.deductedAt,
      }));
      const out = buildForm16AQuarterly(mapped, {
        fiscalYear: fyForRange.name,
        quarter,
      });
      return NextResponse.json(out);
    }

    // Default: list view, paginated.
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 200);

    const [deductions, total] = await Promise.all([
      prisma.tdsDeduction.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, panNo: true } },
          // After migration 8 (bill→GL posting), exactly one of payment
          // or bill is set per row depending on whether TDS was deducted
          // at payment time (cash basis) or bill time (accrual). Include
          // both — frontend renders whichever is non-null.
          payment: { select: { id: true, paymentNumber: true, date: true } },
          bill: { select: { id: true, billNumber: true, date: true } },
        },
        orderBy: { deductedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tdsDeduction.count({ where }),
    ]);

    return NextResponse.json({
      data: deductions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid fiscal year")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error listing TDS deductions");
    return NextResponse.json(
      { error: "Failed to list TDS deductions" },
      { status: 500 }
    );
  }
});
