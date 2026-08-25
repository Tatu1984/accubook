import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { getDocument } from "@/backend/services/documents/storage";
import { extractDocument } from "@/backend/services/ocr/extract";
import { claudeProvider } from "@/backend/services/ocr/providers/claude";
import { ExtractionError } from "@/backend/services/ocr/provider";
import { checkRateLimit, rateLimited } from "@/backend/utils/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read it again.
 *
 * Two reasons this exists: a free reading that came back thin can be escalated
 * to the paid engine on the reviewer's say-so (`engine: "claude"`), and a
 * document uploaded before an extractor was configured can be picked up later
 * without re-uploading the file.
 *
 * Corrections already typed are left alone — a re-read replaces the machine's
 * reading, never the human's.
 */

const reprocessSchema = z.object({
  engine: z.enum(["auto", "claude"]).default("auto"),
});

export const POST = withOrgAuth<{ extractionId: string }>(
  async (request, { orgId, params }) => {
    try {
      const rl = await checkRateLimit({
        key: `document-extraction:org:${orgId}`,
        limit: 60,
        windowMs: 60 * 60 * 1000,
      });
      if (!rl.allowed) {
        return rateLimited(rl, "Too many documents read in the last hour — try again shortly");
      }

      const row = await prisma.documentExtraction.findFirst({
        where: { id: params.extractionId, organizationId: orgId },
      });
      if (!row) return notFound("Document not found");
      if (row.status === "CONFIRMED") {
        return badRequest("This document has been posted — re-reading it would change nothing");
      }

      const { engine } = reprocessSchema.parse(await request.json().catch(() => ({})));

      const [buffer, org] = await Promise.all([
        getDocument(row.storageKey),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true, gstNo: true },
        }),
      ]);

      const input = {
        buffer,
        mimeType: row.mimeType,
        fileName: row.fileName,
        expectedDocType: row.docType,
        ownGstin: org?.gstNo ?? null,
        ownName: org?.name ?? null,
      };

      const startedAt = Date.now();
      try {
        const result =
          engine === "claude"
            ? await claudeProvider.extract(input)
            : await extractDocument(input);

        const updated = await prisma.documentExtraction.update({
          where: { id: row.id },
          data: {
            status: "NEEDS_REVIEW",
            docType:
              result.document.docType !== "UNKNOWN" ? result.document.docType : row.docType,
            direction: result.document.direction ?? row.direction,
            provider: result.provider,
            model: result.model ?? null,
            inputTokens: result.inputTokens ?? null,
            outputTokens: result.outputTokens ?? null,
            // Re-reading is a second purchase, not a correction of the first.
            costMicroUsd: (row.costMicroUsd ?? 0) + result.costMicroUsd,
            durationMs: Date.now() - startedAt,
            pageCount: result.pageCount ?? row.pageCount,
            extracted: result.document,
            confidence: result.confidence,
            error: null,
          },
        });

        return NextResponse.json(updated);
      } catch (error) {
        if (error instanceof ExtractionError) return badRequest(error.message);
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) return badRequest("Validation failed", error.issues);
      logger.error({ err: error }, "Error re-reading document");
      return NextResponse.json({ error: "Failed to read that document again" }, { status: 500 });
    }
  }
);
