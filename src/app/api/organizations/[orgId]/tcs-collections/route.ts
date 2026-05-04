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
 * GET /api/organizations/[orgId]/tcs-collections
 *
 * Mirror of /tds-deductions for the seller side. Drives Form 27D
 * (the TCS-quarterly equivalent of Form 16A) and 26AS reconciliation
 * from the buyer's view.
 *
 * Same ?view=list / ?view=form27d split, same filters. The aggregator
 * output is shape-compatible with Form 16A (Form 27D presents the
 * same per-party-per-section table; the shape carries through).
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "list";

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
      where.collectedAt = { gte: startDate, lte: endDate };
    }

    if (view === "form27d") {
      if (!fyForRange || !quarter) {
        return NextResponse.json(
          { error: "form27d view requires fy + quarter" },
          { status: 400 }
        );
      }
      const rows = await prisma.tcsCollection.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, panNo: true } },
        },
        orderBy: { collectedAt: "asc" },
      });
      const mapped: DeductionRow[] = rows.map((r) => ({
        partyId: r.partyId,
        partyName: r.party.name,
        partyPan: r.party.panNo,
        section: r.section,
        baseAmount: r.baseAmount,
        taxAmount: r.taxAmount,
        ratePercent: r.ratePercent,
        deductedAt: r.collectedAt,
      }));
      const out = buildForm16AQuarterly(mapped, {
        fiscalYear: fyForRange.name,
        quarter,
      });
      return NextResponse.json(out);
    }

    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 200);

    const [collections, total] = await Promise.all([
      prisma.tcsCollection.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, panNo: true } },
          receipt: { select: { id: true, receiptNumber: true, date: true } },
        },
        orderBy: { collectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tcsCollection.count({ where }),
    ]);

    return NextResponse.json({
      data: collections,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid fiscal year")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error listing TCS collections");
    return NextResponse.json(
      { error: "Failed to list TCS collections" },
      { status: 500 }
    );
  }
});
