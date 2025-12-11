import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createLedgerGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nature: z.enum(["ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "EQUITY"]),
  parentId: z.string().optional(),
  description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to organization
    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
    console.error("Error fetching ledger groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger groups" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
      return NextResponse.json(
        { error: "Ledger group with this name already exists" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating ledger group:", error);
    return NextResponse.json(
      { error: "Failed to create ledger group" },
      { status: 500 }
    );
  }
}
