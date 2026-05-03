import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D } from "@/backend/utils/money";
import { formatNumber, nextNumber } from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bomComponentSchema = z.object({
  itemId: z.string().min(1, "Component itemId is required"),
  quantity: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  unitId: z.string().min(1, "Component unit is required"),
  unitCost: z.union([z.number().min(0), z.string()]).optional().transform((v) => (v === undefined ? null : D(v))),
  notes: z.string().optional(),
});

const createBomSchema = z.object({
  itemId: z.string().min(1, "Finished-good itemId is required"),
  outputQuantity: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  outputUnitId: z.string().min(1, "Output unit is required"),
  description: z.string().optional(),
  components: z.array(bomComponentSchema).min(1, "At least one component is required"),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (itemId) where.itemId = itemId;
    if (isActive !== null) where.isActive = isActive === "true";

    const [boms, total] = await Promise.all([
      prisma.bom.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, sku: true } },
          outputUnit: { select: { id: true, name: true, symbol: true } },
          components: {
            include: {
              item: { select: { id: true, name: true, sku: true } },
              unit: { select: { id: true, name: true, symbol: true } },
            },
            orderBy: { sequence: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bom.count({ where }),
    ]);

    return NextResponse.json({
      data: boms,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching BOMs");
    return NextResponse.json({ error: "Failed to fetch BOMs" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const validated = createBomSchema.parse(await request.json());

    // Verify finished-good item exists in org.
    const fg = await prisma.item.findFirst({
      where: { id: validated.itemId, organizationId: orgId },
      select: { id: true },
    });
    if (!fg) return notFound("Finished-good item not found");

    // Verify all component items exist in org.
    const componentIds = [...new Set(validated.components.map((c) => c.itemId))];
    const found = await prisma.item.findMany({
      where: { id: { in: componentIds }, organizationId: orgId },
      select: { id: true },
    });
    if (found.length !== componentIds.length) {
      const foundSet = new Set(found.map((f) => f.id));
      const missing = componentIds.filter((id) => !foundSet.has(id));
      return badRequest(`Component items not found in organization: ${missing.join(", ")}`);
    }

    const bom = await prisma.$transaction(async (tx) => {
      const bomNumber = formatNumber("BOM", await nextNumber(tx, orgId, "BOM"));
      const created = await tx.bom.create({
        data: {
          organizationId: orgId,
          itemId: validated.itemId,
          bomNumber,
          outputQuantity: validated.outputQuantity,
          outputUnitId: validated.outputUnitId,
          description: validated.description,
          isActive: true,
          components: {
            create: validated.components.map((c, i) => ({
              itemId: c.itemId,
              quantity: c.quantity,
              unitId: c.unitId,
              unitCost: c.unitCost,
              notes: c.notes,
              sequence: i,
            })),
          },
        },
        include: {
          item: true,
          outputUnit: true,
          components: { include: { item: true, unit: true } },
        },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "Bom",
        entityId: created.id,
        newData: {
          bomNumber,
          itemId: validated.itemId,
          componentCount: validated.components.length,
        },
      });
      return created;
    });

    return NextResponse.json(bom, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating BOM");
    return NextResponse.json({ error: "Failed to create BOM" }, { status: 500 });
  }
});
