import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import type { Prisma } from "@/generated/prisma";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Field names here are Prisma column names, because the parsed object is
 * handed to `item.update` below. `taxConfigId` and `reorderQuantity` used
 * to appear in this list and exist on no model — the Item columns are
 * `purchaseTaxId` / `salesTaxId` and `reorderQty` — so any PATCH that set
 * them died on an unknown-argument error from Prisma. The `satisfies
 * Prisma.ItemUncheckedUpdateInput` below now makes that a build failure.
 *
 * `type` matches the create route's values, and `.strict()` means an
 * unrecognised key is reported as such instead of being dropped.
 */
const updateItemSchema = z.object({
  name: optional(z.string().min(1)),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  type: optional(z.enum(["GOODS", "SERVICES"])),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  primaryUnitId: optional(z.string()),
  purchasePrice: z.number().optional().nullable(),
  sellingPrice: z.number().optional().nullable(),
  mrp: z.number().optional().nullable(),
  purchaseTaxId: z.string().optional().nullable(),
  salesTaxId: z.string().optional().nullable(),
  minStock: z.number().optional().nullable(),
  maxStock: z.number().optional().nullable(),
  reorderLevel: z.number().optional().nullable(),
  reorderQty: z.number().optional().nullable(),
  isActive: optional(z.boolean()),
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

  // Spelled out rather than spread: an object literal checked with
  // `satisfies` is the only form TypeScript rejects for a key that is not
  // an Item column, which is exactly the mistake that used to 500 here.
  // `undefined` is Prisma's "leave this column alone".
  const data = {
    name: validatedData.name,
    sku: validatedData.sku,
    barcode: validatedData.barcode,
    type: validatedData.type,
    categoryId: validatedData.categoryId,
    description: validatedData.description,
    hsnCode: validatedData.hsnCode,
    sacCode: validatedData.sacCode,
    primaryUnitId: validatedData.primaryUnitId,
    purchasePrice: validatedData.purchasePrice,
    sellingPrice: validatedData.sellingPrice,
    mrp: validatedData.mrp,
    purchaseTaxId: validatedData.purchaseTaxId,
    salesTaxId: validatedData.salesTaxId,
    minStock: validatedData.minStock,
    maxStock: validatedData.maxStock,
    reorderLevel: validatedData.reorderLevel,
    reorderQty: validatedData.reorderQty,
    isActive: validatedData.isActive,
    // "Unchecked" is the variant that takes scalar foreign keys
    // (categoryId, salesTaxId, …) rather than nested relation connects.
  } satisfies Prisma.ItemUncheckedUpdateInput;

  const item = await prisma.item.update({
    where: { id: params.itemId },
    data,
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
