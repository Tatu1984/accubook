import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { logger } from "@/backend/utils/logger";

export async function GET() {
  try {
    const currencies = await prisma.currency.findMany({
      orderBy: {
        code: "asc",
      },
    });

    return NextResponse.json(currencies);
  } catch (error) {
    logger.error({ err: error }, "Error fetching currencies");
    return NextResponse.json(
      { error: "Failed to fetch currencies" },
      { status: 500 }
    );
  }
}
