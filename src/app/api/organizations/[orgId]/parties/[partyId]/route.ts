import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
}).strict();

export const GET = withOrgAuth<{ partyId: string }>(async (_request, { orgId, params }) => {
  try {
    const { partyId } = params;

    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        organizationId: orgId,
      },
    });

    if (!party) {
      return notFound("Party not found");
    }

    return NextResponse.json(party);
  } catch (error) {
    logger.error({ err: error }, "Error fetching party");
    return NextResponse.json(
      { error: "Failed to fetch party" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth<{ partyId: string }>(async (request, { orgId, params }) => {
  try {
    const { partyId } = params;
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
      return notFound("Party not found");
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
        return badRequest("A party with this name already exists");
      }
    }

    const party = await prisma.party.update({
      where: { id: partyId },
      data: validatedData,
    });

    return NextResponse.json(party);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating party");
    return NextResponse.json(
      { error: "Failed to update party" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth<{ partyId: string }>(async (_request, { orgId, params }) => {
  try {
    const { partyId } = params;

    // Check if party exists
    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        organizationId: orgId,
      },
    });

    if (!party) {
      return notFound("Party not found");
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
    logger.error({ err: error }, "Error deleting party");
    return NextResponse.json(
      { error: "Failed to delete party" },
      { status: 500 }
    );
  }
});
