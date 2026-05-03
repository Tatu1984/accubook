import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createLedgerGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nature: z.enum(["ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "EQUITY"]),
  parentId: z.string().optional(),
  description: z.string().optional(),
});

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const ledgerGroups = await prisma.ledgerGroup.findMany({
      where: {
        organizationId: orgId,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            ledgers: true,
          },
        },
      },
      orderBy: [{ nature: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(ledgerGroups);
  } catch (error) {
    logger.error({ err: error }, "Error fetching ledger groups");
    return NextResponse.json(
      { error: "Failed to fetch ledger groups" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createLedgerGroupSchema.parse(body);

    // Check if name already exists in organization
    const existing = await prisma.ledgerGroup.findUnique({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: validatedData.name,
        },
      },
    });

    if (existing) {
      return badRequest("Ledger group with this name already exists");
    }

    const ledgerGroup = await prisma.ledgerGroup.create({
      data: {
        organizationId: orgId,
        ...validatedData,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(ledgerGroup, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating ledger group");
    return NextResponse.json(
      { error: "Failed to create ledger group" },
      { status: 500 }
    );
  }
});
