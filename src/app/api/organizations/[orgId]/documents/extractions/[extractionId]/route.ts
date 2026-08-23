import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import { deleteDocument } from "@/backend/services/documents/storage";
import { extractedDocumentSchema, DOC_TYPES, DIRECTIONS } from "@/backend/services/ocr/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One document under review.
 *
 * PATCH saves the reviewer's corrections without posting anything — the review
 * screen writes on every field change, so a half-checked bill survives a
 * closed tab. The corrected reading is kept separately from the extracted one
 * (`reviewed` vs `extracted`) so the two stay comparable: what the machine
 * read and what a human made of it are both part of the audit trail, and the
 * gap between them is the only honest measure of how good the extractor is.
 */

const patchSchema = z.object({
  docType: optional(z.enum(DOC_TYPES)),
  direction: z.enum(DIRECTIONS).nullable().optional(),
  status: optional(z.enum(["NEEDS_REVIEW", "REJECTED"])),
  reviewed: optional(extractedDocumentSchema),
});

export const GET = withOrgAuth<{ extractionId: string }>(async (_req, { orgId, params }) => {
  try {
    const row = await prisma.documentExtraction.findFirst({
      where: { id: params.extractionId, organizationId: orgId },
    });
    if (!row) return notFound("Document not found");
    return NextResponse.json(row);
  } catch (error) {
    logger.error({ err: error }, "Error loading document extraction");
    return NextResponse.json({ error: "Failed to load that document" }, { status: 500 });
  }
});

export const PATCH = withOrgAuth<{ extractionId: string }>(
  async (request, { orgId, userId, params }) => {
    try {
      const existing = await prisma.documentExtraction.findFirst({
        where: { id: params.extractionId, organizationId: orgId },
        select: { id: true, status: true },
      });
      if (!existing) return notFound("Document not found");
      if (existing.status === "CONFIRMED") {
        return badRequest("This document has already been confirmed and posted");
      }

      const data = patchSchema.parse(await request.json());

      const updated = await prisma.documentExtraction.update({
        where: { id: existing.id },
        data: {
          ...(data.docType ? { docType: data.docType } : {}),
          ...(data.direction !== undefined ? { direction: data.direction } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.reviewed ? { reviewed: data.reviewed } : {}),
          ...(data.status === "REJECTED"
            ? { reviewedById: userId, reviewedAt: new Date() }
            : {}),
        },
      });

      if (data.status === "REJECTED") {
        await writeAudit(prisma, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "DocumentExtraction",
          entityId: existing.id,
          newData: { status: "REJECTED" },
        });
      }

      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
      logger.error({ err: error }, "Error updating document extraction");
      return NextResponse.json({ error: "Failed to save those changes" }, { status: 500 });
    }
  }
);

export const DELETE = withOrgAuth<{ extractionId: string }>(
  async (_req, { orgId, userId, params }) => {
    try {
      const row = await prisma.documentExtraction.findFirst({
        where: { id: params.extractionId, organizationId: orgId },
        select: { id: true, storageKey: true, status: true, postedEntityId: true },
      });
      if (!row) return notFound("Document not found");
      if (row.postedEntityId) {
        return badRequest(
          "This document has been posted — the original has to stay on file behind the record it created"
        );
      }

      await prisma.documentExtraction.delete({ where: { id: row.id } });
      await deleteDocument(row.storageKey).catch((error) =>
        logger.error({ err: error, key: row.storageKey }, "Stored document could not be removed")
      );

      await writeAudit(prisma, {
        organizationId: orgId,
        userId,
        action: "DELETE",
        entityType: "DocumentExtraction",
        entityId: row.id,
        oldData: { storageKey: row.storageKey },
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error({ err: error }, "Error deleting document extraction");
      return NextResponse.json({ error: "Failed to delete that document" }, { status: 500 });
    }
  }
);
