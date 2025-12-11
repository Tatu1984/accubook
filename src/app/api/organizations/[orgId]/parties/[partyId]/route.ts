import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const updatePartySchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  gstNo: z.string().optional().nullable(),
  panNo: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  billingCity: z.string().optional().nullable(),
  billingState: z.string().optional().nullable(),
  billingCountry: z.string().optional().nullable(),
  billingPostal: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  shippingCity: z.string().optional().nullable(),
  shippingState: z.string().optional().nullable(),
  shippingCountry: z.string().optional().nullable(),
  shippingPostal: z.string().optional().nullable(),
  creditLimit: z.number().optional().nullable(),
  creditDays: z.number().optional().nullable(),
  openingBalance: z.number().optional(),
  openingBalanceType: z.enum(["DEBIT", "CREDIT"]).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; partyId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, partyId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        organizationId: orgId,
      },
    });

    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    return NextResponse.json(party);
  } catch (error) {
    console.error("Error fetching party:", error);
    return NextResponse.json(
      { error: "Failed to fetch party" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; partyId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, partyId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updatePartySchema.parse(body);

    // Check if party exists
    const existingParty = await prisma.party.findFirst({
      where: {
        id: partyId,
        organizationId: orgId,
      },
    });

    if (!existingParty) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    // Check for name uniqueness if name is being changed
    if (validatedData.name && validatedData.name !== existingParty.name) {
      const nameExists = await prisma.party.findFirst({
        where: {
          organizationId: orgId,
          name: validatedData.name,
          NOT: { id: partyId },
        },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "A party with this name already exists" },
          { status: 400 }
        );
      }
    }

    const party = await prisma.party.update({
      where: { id: partyId },
      data: validatedData,
    });

    return NextResponse.json(party);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating party:", error);
    return NextResponse.json(
      { error: "Failed to update party" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; partyId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId, partyId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if party exists
    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        organizationId: orgId,
      },
    });

    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    // Check if party has any invoices or bills
    const hasInvoices = await prisma.invoice.findFirst({
      where: { partyId },
    });

    const hasBills = await prisma.bill.findFirst({
      where: { partyId },
    });

    if (hasInvoices || hasBills) {
      // Soft delete
      await prisma.party.update({
        where: { id: partyId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    // Hard delete
    await prisma.party.delete({
      where: { id: partyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting party:", error);
    return NextResponse.json(
      { error: "Failed to delete party" },
      { status: 500 }
    );
  }
}
