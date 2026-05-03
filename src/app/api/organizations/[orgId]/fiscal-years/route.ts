import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const fiscalYears = await prisma.fiscalYear.findMany({
      where: {
        organizationId: orgId,
      },
      orderBy: {
        startDate: "desc",
      },
    });

    return NextResponse.json(fiscalYears);
  } catch (error) {
    logger.error({ err: error }, "Error fetching fiscal years");
    return NextResponse.json(
      { error: "Failed to fetch fiscal years" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { name, startDate, endDate } = body;

    if (!name || !startDate || !endDate) {
      return badRequest("Name, start date, and end date are required");
    }

    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        organizationId: orgId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    return NextResponse.json(fiscalYear, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating fiscal year");
    return NextResponse.json(
      { error: "Failed to create fiscal year" },
      { status: 500 }
    );
  }
});
