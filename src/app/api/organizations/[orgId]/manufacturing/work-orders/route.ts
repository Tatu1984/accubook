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

const createWorkOrderSchema = z.object({
  bomId: z.string().min(1, "bomId is required"),
  plannedQuantity: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  warehouseId: z.string().optional(),
  startDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  endDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  notes: z.string().optional(),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const itemId = searchParams.get("itemId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (status) where.status = status;
    if (itemId) where.itemId = itemId;

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, sku: true } },
          bom: { select: { id: true, bomNumber: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workOrder.count({ where }),
    ]);

    return NextResponse.json({
      data: workOrders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching work orders");
    return NextResponse.json({ error: "Failed to fetch work orders" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const validated = createWorkOrderSchema.parse(await request.json());

    // Confirm BOM exists in org and is active.
    const bom = await prisma.bom.findFirst({
      where: { id: validated.bomId, organizationId: orgId },
      select: { id: true, itemId: true, isActive: true },
    });
    if (!bom) return notFound("BOM not found");
    if (!bom.isActive) return badRequest("BOM is inactive");

    if (validated.warehouseId) {
      const wh = await prisma.warehouse.findFirst({
        where: { id: validated.warehouseId, organizationId: orgId },
        select: { id: true },
      });
      if (!wh) return notFound("Warehouse not found");
    }

    const workOrder = await prisma.$transaction(async (tx) => {
      const workOrderNumber = formatNumber("WO", await nextNumber(tx, orgId, "WORK_ORDER"));
      const created = await tx.workOrder.create({
        data: {
          organizationId: orgId,
          workOrderNumber,
          bomId: validated.bomId,
          itemId: bom.itemId,
          plannedQuantity: validated.plannedQuantity,
          warehouseId: validated.warehouseId,
          startDate: validated.startDate,
          endDate: validated.endDate,
          notes: validated.notes,
          status: "DRAFT",
        },
        include: {
          item: true,
          bom: true,
          warehouse: true,
        },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "WorkOrder",
        entityId: created.id,
        newData: {
          workOrderNumber,
          bomId: validated.bomId,
          plannedQuantity: validated.plannedQuantity.toString(),
        },
      });
      return created;
    });

    return NextResponse.json(workOrder, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating work order");
    return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
  }
});
