import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const categories = await prisma.itemCategory.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    logger.error({ err: error }, "Error fetching item categories");
    return NextResponse.json(
      { error: "Failed to fetch item categories" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { name, description, hsnCode, sacCode, parentId } = body;

    if (!name) {
      return badRequest("Name is required");
    }

    const category = await prisma.itemCategory.create({
      data: {
        organizationId: orgId,
        name,
        description,
        hsnCode,
        sacCode,
        parentId,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating item category");
    return NextResponse.json(
      { error: "Failed to create item category" },
      { status: 500 }
    );
  }
});
