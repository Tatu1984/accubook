import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  type: z.enum(["GOODS", "SERVICE"]).optional(),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  primaryUnitId: z.string().optional(),
  purchasePrice: z.number().optional().nullable(),
  sellingPrice: z.number().optional().nullable(),
  taxConfigId: z.string().optional().nullable(),
  reorderLevel: z.number().optional().nullable(),
  reorderQuantity: z.number().optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export const GET = withOrgAuth<{ itemId: string }>(async (_request, { orgId, params }) => {
  const item = await prisma.item.findFirst({
    where: { id: params.itemId, organizationId: orgId },
    include: {
      category: true,
      primaryUnit: true,
      purchaseTax: true,
      salesTax: true,
    },
  });

  if (!item) return notFound("Item not found");
  return NextResponse.json(item);
});

export const PATCH = withOrgAuth<{ itemId: string }>(async (request, { orgId, params }) => {
  let validatedData: z.infer<typeof updateItemSchema>;
  try {
    validatedData = updateItemSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
    throw error;
  }

  const existingItem = await prisma.item.findFirst({
    where: { id: params.itemId, organizationId: orgId },
  });
  if (!existingItem) return notFound("Item not found");

  if (validatedData.name && validatedData.name !== existingItem.name) {
    const nameExists = await prisma.item.findFirst({
      where: {
        organizationId: orgId,
        name: validatedData.name,
        NOT: { id: params.itemId },
      },
    });
    if (nameExists) return badRequest("An item with this name already exists");
  }

  const item = await prisma.item.update({
    where: { id: params.itemId },
    data: validatedData,
    include: { category: true, primaryUnit: true, purchaseTax: true, salesTax: true },
  });

  return NextResponse.json(item);
});

export const DELETE = withOrgAuth<{ itemId: string }>(async (_request, { orgId, params }) => {
  const item = await prisma.item.findFirst({
    where: { id: params.itemId, organizationId: orgId },
  });
  if (!item) return notFound("Item not found");

  const [hasStock, hasInvoiceItems] = await Promise.all([
    prisma.stock.findFirst({ where: { itemId: params.itemId } }),
    prisma.invoiceItem.findFirst({ where: { itemId: params.itemId } }),
  ]);

  if (hasStock || hasInvoiceItems) {
    await prisma.item.update({
      where: { id: params.itemId },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, softDeleted: true });
  }

  await prisma.item.delete({ where: { id: params.itemId } });
  return NextResponse.json({ success: true });
});
