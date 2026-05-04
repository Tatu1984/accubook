import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { FREQUENCIES, type Frequency } from "@/backend/services/billing/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().min(0.0001),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxId: z.string().optional(),
  description: z.string().optional(),
});

const createSchema = z.object({
  partyId: z.string().min(1),
  frequency: z.enum(FREQUENCIES as readonly [Frequency, ...Frequency[]]),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  dueDays: z.number().int().min(0).max(365).default(15),
  items: z.array(itemSchema).min(1, "At least one item is required"),
  meta: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

/**
 * GET /api/organizations/[orgId]/recurring-invoices
 *   ?active=true   filter to active templates
 *   ?dueOnly=true  filter to those whose nextRunDate is in the past
 */
export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (searchParams.get("active") === "true") where.isActive = true;
    if (searchParams.get("dueOnly") === "true") {
      where.isActive = true;
      where.nextRunDate = { lte: new Date() };
    }
    const rows = await prisma.recurringInvoice.findMany({
      where,
      include: {
        party: { select: { id: true, name: true } },
        lastInvoice: { select: { id: true, invoiceNumber: true, date: true } },
      },
      orderBy: { nextRunDate: "asc" },
    });
    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error({ err: error }, "Error listing recurring invoices");
    return NextResponse.json(
      { error: "Failed to list recurring invoices" },
      { status: 500 }
    );
  }
});

/**
 * POST creates a new recurring invoice template.
 *
 * The first run happens at `startDate` (inclusive). After each run the
 * runner advances `nextRunDate` by one frequency interval. `endDate`
 * caps the run window if set.
 */
export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const data = createSchema.parse(await request.json());

    const party = await prisma.party.findFirst({
      where: { id: data.partyId, organizationId: orgId },
      select: { id: true },
    });
    if (!party) return notFound("Party not found");

    const created = await prisma.recurringInvoice.create({
      data: {
        organizationId: orgId,
        partyId: data.partyId,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate,
        nextRunDate: data.startDate,
        dueDays: data.dueDays,
        items: data.items as unknown as object,
        ...(data.meta ? { meta: data.meta as unknown as object } : {}),
        isActive: data.isActive,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating recurring invoice");
    return NextResponse.json(
      { error: "Failed to create recurring invoice" },
      { status: 500 }
    );
  }
});
