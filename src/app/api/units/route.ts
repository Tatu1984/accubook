import { NextResponse } from "next/server";
import { auth } from "@/backend/services/auth.service";
import { prisma } from "@/backend/database/client";
import { cookies } from "next/headers";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const units = await prisma.unitOfMeasure.findMany({
      where: {
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(units);
  } catch (error) {
    logger.error({ err: error }, "Error fetching units");
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, symbol, decimalPlaces } = body;

    if (!name || !symbol) {
      return NextResponse.json(
        { error: "Name and symbol are required" },
        { status: 400 }
      );
    }

    const unit = await prisma.unitOfMeasure.create({
      data: {
        name,
        symbol,
        decimalPlaces: decimalPlaces || 2,
      },
    });

    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating unit");
    return NextResponse.json(
      { error: "Failed to create unit" },
      { status: 500 }
    );
  }
}
