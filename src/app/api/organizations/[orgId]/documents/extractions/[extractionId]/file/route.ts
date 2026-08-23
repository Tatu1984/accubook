import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { getDocument } from "@/backend/services/documents/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The original, as the counterparty sent it.
 *
 * Served through the app rather than as a storage URL so the file is behind
 * the same tenant check as everything else — a blob link, once copied out of
 * a browser tab, answers to anyone. The left-hand panel of the review screen
 * points here.
 */
export const GET = withOrgAuth<{ extractionId: string }>(async (_req, { orgId, params }) => {
  try {
    const row = await prisma.documentExtraction.findFirst({
      where: { id: params.extractionId, organizationId: orgId },
      select: { storageKey: true, mimeType: true, fileName: true },
    });
    if (!row) return notFound("Document not found");

    const body = await getDocument(row.storageKey);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(body.byteLength),
        // Inline: this is meant to be looked at beside the form, not downloaded.
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error serving stored document");
    return NextResponse.json({ error: "That file could not be read" }, { status: 500 });
  }
});
