import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import {
  buildStorageKey,
  isAcceptedMimeType,
  MAX_DOCUMENT_BYTES,
  putDocument,
} from "@/backend/services/documents/storage";
import { engineStatus, extractDocument } from "@/backend/services/ocr/extract";
import { ExtractionError } from "@/backend/services/ocr/provider";
import { summariseSpend } from "@/backend/services/ocr/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The document inbox.
 *
 * GET lists what has come in and where each item stands. POST takes a file —
 * a phone photo, a scan, a PDF — stores it, reads it, and parks it for review.
 *
 * Reading happens inside the request rather than in a queue because the person
 * who just uploaded is standing there waiting to check it, and a page of
 * extraction takes a few seconds. A failure is recorded on the row (status
 * FAILED with the reason) instead of losing the upload: the file is the
 * evidence and survives whatever the extractor made of it.
 */

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const status = searchParams.get("status");
    const docType = searchParams.get("docType");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);

    if (view === "usage") {
      // What extraction has cost this organization — the basis for pricing a
      // pack of credits, so it reads from recorded spend, never an estimate.
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [month, all] = await Promise.all([
        prisma.documentExtraction.findMany({
          where: { organizationId: orgId, createdAt: { gte: since } },
          select: { costMicroUsd: true, inputTokens: true, outputTokens: true },
        }),
        prisma.documentExtraction.findMany({
          where: { organizationId: orgId },
          select: { costMicroUsd: true, inputTokens: true, outputTokens: true },
        }),
      ]);
      const byProvider = await prisma.documentExtraction.groupBy({
        by: ["provider"],
        where: { organizationId: orgId },
        _count: { _all: true },
        _sum: { costMicroUsd: true },
      });

      return NextResponse.json({
        engine: engineStatus(),
        last30Days: summariseSpend(month),
        allTime: summariseSpend(all),
        byProvider: byProvider.map((row) => ({
          provider: row.provider ?? "unknown",
          documents: row._count._all,
          costMicroUsd: row._sum.costMicroUsd ?? 0,
        })),
      });
    }

    const where = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(docType ? { docType } : {}),
    };

    const [rows, counts] = await Promise.all([
      prisma.documentExtraction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          source: true,
          sourceRef: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          pageCount: true,
          status: true,
          docType: true,
          direction: true,
          provider: true,
          model: true,
          costMicroUsd: true,
          durationMs: true,
          extracted: true,
          reviewed: true,
          confidence: true,
          error: true,
          postedEntityType: true,
          postedEntityId: true,
          createdAt: true,
          reviewedAt: true,
        },
      }),
      prisma.documentExtraction.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      data: rows,
      engine: engineStatus(),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  } catch (error) {
    logger.error({ err: error }, "Error listing document extractions");
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return badRequest("Upload the document as multipart/form-data");

    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("No file was uploaded");
    if (file.size === 0) return badRequest("That file is empty");
    if (file.size > MAX_DOCUMENT_BYTES) {
      return badRequest(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!isAcceptedMimeType(mimeType)) {
      return badRequest(`${mimeType} is not a document — upload a PDF or a photo`);
    }

    const expectedDocType = (form.get("docType") as string | null) ?? undefined;
    const sourceRef = (form.get("sourceRef") as string | null) ?? file.name;

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = buildStorageKey(orgId, file.name || "document");
    await putDocument(storageKey, buffer, mimeType);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, gstNo: true },
    });

    const row = await prisma.documentExtraction.create({
      data: {
        organizationId: orgId,
        source: "UPLOAD",
        sourceRef,
        fileName: file.name || "document",
        mimeType,
        fileSize: buffer.byteLength,
        storageKey,
        status: "PROCESSING",
        docType: expectedDocType ?? "UNKNOWN",
        createdById: userId,
      },
    });

    const startedAt = Date.now();
    try {
      const result = await extractDocument({
        buffer,
        mimeType,
        fileName: file.name || "document",
        expectedDocType,
        ownGstin: org?.gstNo ?? null,
        ownName: org?.name ?? null,
      });

      const updated = await prisma.documentExtraction.update({
        where: { id: row.id },
        data: {
          status: "NEEDS_REVIEW",
          docType:
            result.document.docType !== "UNKNOWN"
              ? result.document.docType
              : (expectedDocType ?? "UNKNOWN"),
          direction: result.document.direction ?? null,
          provider: result.provider,
          model: result.model ?? null,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          costMicroUsd: result.costMicroUsd,
          durationMs: Date.now() - startedAt,
          pageCount: result.pageCount ?? null,
          extracted: result.document,
          confidence: result.confidence,
        },
      });

      await writeAudit(prisma, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "DocumentExtraction",
        entityId: row.id,
        newData: {
          fileName: updated.fileName,
          provider: result.provider,
          model: result.model ?? null,
          costMicroUsd: result.costMicroUsd,
        },
      });

      return NextResponse.json(updated, { status: 201 });
    } catch (error) {
      const message =
        error instanceof ExtractionError
          ? error.message
          : "The document could not be read automatically — fill it in by hand";
      if (!(error instanceof ExtractionError)) {
        logger.error({ err: error, extractionId: row.id }, "Document extraction failed");
      }

      // The upload survives a failed reading: the file is still the evidence,
      // and the review screen opens on it with an empty form.
      const failed = await prisma.documentExtraction.update({
        where: { id: row.id },
        data: {
          status: "NEEDS_REVIEW",
          provider: "manual",
          costMicroUsd: 0,
          durationMs: Date.now() - startedAt,
          extracted: { docType: expectedDocType ?? "UNKNOWN", lines: [] },
          confidence: { overall: 0 },
          error: message,
        },
      });
      return NextResponse.json(failed, { status: 201 });
    }
  } catch (error) {
    logger.error({ err: error }, "Error accepting document upload");
    return NextResponse.json({ error: "Failed to accept that document" }, { status: 500 });
  }
});
