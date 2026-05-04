import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  buildForm16AQuarterly,
  quarterDateRange,
  type DeductionRow,
} from "@/backend/services/tax/form-16a";
import {
  buildMonthlyChallan,
  type ChallanRow,
} from "@/backend/services/tax/monthly-challan";

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
 *   ?view=list             → paginated raw deduction rows (default)
 *   ?view=form16a          → quarterly Form 16A aggregator output
 *   ?view=monthly-challan  → monthly section-wise totals + ITNS-281 due date
 *
 *   Filters (all optional unless noted):
 *     ?fiscalYearId=...   restrict to one FY
 *     ?fy=2025-26         alternative — resolves the FY by name
 *     ?quarter=1..4       restrict to FY quarter (form16a requires this)
 *     ?month=1..12        calendar month (monthly-challan requires this)
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

    if (view === "monthly-challan") {
      // Section 192-206C requires monthly TDS deposit. This view sums
      // deductions by section for one (fy, month) so the user knows
      // exactly what to pay on each ITNS-281 challan. Quarterly views
      // (Form 16A) come later for the cert; this is the monthly
      // deposit pre-step.
      if (!fyForRange) {
        return NextResponse.json(
          { error: "monthly-challan view requires fy or fiscalYearId" },
          { status: 400 }
        );
      }
      const monthRaw = searchParams.get("month");
      const monthNum = monthRaw ? parseInt(monthRaw, 10) : NaN;
      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        return NextResponse.json(
          { error: "monthly-challan view requires `month` (1-12)" },
          { status: 400 }
        );
      }
      // Calendar year that contains this month within the FY:
      // Apr–Dec → FY's start year, Jan–Mar → next year.
      const fyStartYear = parseInt(fyForRange.name.slice(0, 4), 10);
      const calendarYear = monthNum >= 4 ? fyStartYear : fyStartYear + 1;
      const startDate = new Date(Date.UTC(calendarYear, monthNum - 1, 1));
      const endDate = new Date(
        Date.UTC(calendarYear, monthNum, 0, 23, 59, 59, 999)
      );
      // Re-scope `where` to the month range, dropping any quarter
      // filter the caller may have set (which would conflict).
      const monthlyWhere: Record<string, unknown> = {
        organizationId: orgId,
      };
      if (fiscalYearId) monthlyWhere.fiscalYearId = fiscalYearId;
      if (partyId) monthlyWhere.partyId = partyId;
      if (section) monthlyWhere.section = section;
      monthlyWhere.deductedAt = { gte: startDate, lte: endDate };

      const rows = await prisma.tdsDeduction.findMany({
        where: monthlyWhere,
        include: {
          party: { select: { id: true, name: true, panNo: true } },
        },
        orderBy: { deductedAt: "asc" },
      });
      const mapped: ChallanRow[] = rows.map((r) => ({
        partyId: r.partyId,
        partyName: r.party.name,
        partyPan: r.party.panNo,
        section: r.section,
        baseAmount: r.baseAmount,
        taxAmount: r.taxAmount,
        deductedAt: r.deductedAt,
      }));
      const out = buildMonthlyChallan(mapped, {
        fiscalYear: fyForRange.name,
        month: monthNum as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
        calendarYear,
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
