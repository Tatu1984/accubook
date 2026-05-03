import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async () => {
  try {
    // Voucher types are global (not per-organization), fetch all active ones
    const voucherTypes = await prisma.voucherType.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(voucherTypes);
  } catch (error) {
    logger.error({ err: error }, "Error fetching voucher types");
    return NextResponse.json(
      { error: "Failed to fetch voucher types" },
      { status: 500 }
    );
  }
});
