import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    nature: z.enum(["ASSETS", "LIABILITIES", "INCOME", "EXPENSES", "EQUITY"]).optional(),
    parentId: z.string().nullable().optional(),
  })
  .strict();

export const PATCH = withOrgAuth<{ groupId: string }>(
  async (request, { orgId, userId, params }) => {
    try {
      const { groupId } = params;
      const before = await prisma.ledgerGroup.findFirst({
        where: { id: groupId, organizationId: orgId },
      });
      if (!before) return notFound("Ledger group not found");
      if (before.isSystem) {
        return badRequest("System ledger groups cannot be edited");
      }
      const body = await request.json();
      const data = patchSchema.parse(body);

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.ledgerGroup.update({
          where: { id: groupId },
          data,
        });
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "LedgerGroup",
          entityId: groupId,
          oldData: before,
          newData: data,
        });
        return u;
      });

      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return badRequest("Validation failed", error.issues);
      }
      logger.error({ err: error }, "Error updating ledger group");
      return NextResponse.json(
        { error: "Failed to update ledger group" },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withOrgAuth<{ groupId: string }>(
  async (_request, { orgId, userId, params }) => {
    try {
      const { groupId } = params;
      const group = await prisma.ledgerGroup.findFirst({
        where: { id: groupId, organizationId: orgId },
        include: {
          _count: { select: { ledgers: true, children: true } },
        },
      });
      if (!group) return notFound("Ledger group not found");
      if (group.isSystem) {
        return badRequest("System ledger groups cannot be deleted");
      }
      if (group._count.ledgers > 0) {
        return badRequest(
          `Cannot delete: ${group._count.ledgers} ledger(s) belong to this group`
        );
      }
      if (group._count.children > 0) {
        return badRequest(
          `Cannot delete: ${group._count.children} sub-group(s) belong to this group`
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.ledgerGroup.delete({ where: { id: groupId } });
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "DELETE",
          entityType: "LedgerGroup",
          entityId: groupId,
          oldData: group,
        });
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting ledger group");
      return NextResponse.json(
        { error: "Failed to delete ledger group" },
        { status: 500 }
      );
    }
  }
);
