import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { extractedDocumentSchema } from "@/backend/services/ocr/schema";
import {
  postExtractedDocument,
  PostExtractedError,
} from "@/backend/services/documents/post-extracted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/documents/extractions/[extractionId]/confirm
 *
 * The moment a reading becomes a record. The reviewer has checked every field
 * against the picture on the left; this creates the Bill or Invoice, as a
 * draft, and stamps the link back so the original stays attached to what it
 * produced.
 *
 * Confirming twice is refused rather than made idempotent — a second identical
 * bill in the books is a worse outcome than an error message.
 */

const confirmSchema = z.object({
  /** The reviewer's final version. Falls back to whatever is already saved. */
  document: optional(extractedDocumentSchema),
  /** Existing party chosen on screen; without one the party is matched or created. */
  partyId: optional(z.string()),
});

export const POST = withOrgAuth<{ extractionId: string }>(
  async (request, { orgId, userId, params }) => {
    try {
      const row = await prisma.documentExtraction.findFirst({
        where: { id: params.extractionId, organizationId: orgId },
      });
      if (!row) return notFound("Document not found");
      if (row.status === "CONFIRMED" || row.postedEntityId) {
        return badRequest(
          `This document was already posted as ${row.postedEntityType ?? "a record"}`
        );
      }

      const body = await request.json().catch(() => ({}));
      const input = confirmSchema.parse(body ?? {});

      const source = input.document ?? row.reviewed ?? row.extracted;
      const parsed = extractedDocumentSchema.safeParse(source);
      if (!parsed.success) {
        return badRequest(
          "This document is not complete enough to post — fill in the fields on the right first",
          parsed.error.issues
        );
      }

      const result = await postExtractedDocument({
        orgId,
        userId,
        extractionId: row.id,
        document: parsed.data,
        partyId: input.partyId,
      });

      const updated = await prisma.documentExtraction.update({
        where: { id: row.id },
        data: {
          status: "CONFIRMED",
          docType: parsed.data.docType,
          direction: parsed.data.direction ?? null,
          reviewed: parsed.data,
          reviewedById: userId,
          reviewedAt: new Date(),
          postedEntityType: result.entityType,
          postedEntityId: result.entityId,
          error: null,
        },
      });

      return NextResponse.json({ ok: true, ...result, extraction: updated }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
      if (error instanceof PostExtractedError) return badRequest(error.message);
      logger.error({ err: error }, "Error confirming extracted document");
      return NextResponse.json(
        { error: "Failed to post that document" },
        { status: 500 }
      );
    }
  }
);
