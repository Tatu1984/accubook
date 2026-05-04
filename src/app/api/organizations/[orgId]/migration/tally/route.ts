import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { importTallyData, parseTallyXml } from "@/backend/services/migration/tally";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/migration/tally
 *
 * Accepts a Tally All-Masters XML file (multipart upload, field name "file",
 * OR raw XML body with content-type application/xml). Imports ledger groups,
 * ledgers, parties, and stock items into the target organization.
 *
 * Idempotent: re-running with the same file skips records already present
 * (matched by name). Reports a per-section summary of created/skipped/errors.
 */
export const POST = withOrgAuth(async (request, { orgId, orgUser, userId }) => {
  if (!hasPermission(orgUser, "settings", "create")) {
    return forbidden("You don't have permission to import data");
  }

  let xml: string;
  try {
    const ctype = request.headers.get("content-type") ?? "";
    if (ctype.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return badRequest("Multipart upload must include a 'file' field");
      }
      if (file.size > 50 * 1024 * 1024) {
        return badRequest("File too large (max 50 MB)");
      }
      xml = await file.text();
    } else if (ctype.includes("xml")) {
      xml = await request.text();
    } else {
      return badRequest(
        "Content-Type must be multipart/form-data (with 'file' field) or application/xml"
      );
    }
  } catch (e) {
    return badRequest(`Failed to read upload: ${(e as Error).message}`);
  }

  if (!xml.trim()) {
    return badRequest("Empty upload");
  }

  try {
    const parsed = parseTallyXml(xml);
    if (
      parsed.groups.length === 0 &&
      parsed.ledgers.length === 0 &&
      parsed.stockItems.length === 0 &&
      parsed.vouchers.length === 0
    ) {
      return badRequest(
        "No GROUP / LEDGER / STOCKITEM / VOUCHER elements found. Confirm the file is a Tally export."
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const summary = await importTallyData(tx, parsed, {
        organizationId: orgId,
        userId,
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "TallyImport",
        newData: {
          counts: {
            groups: summary.groups.created,
            ledgers: summary.ledgers.created,
            parties: summary.parties.created,
            items: summary.items.created,
            vouchers: summary.vouchers.created,
          },
          skipped: {
            groups: summary.groups.skipped,
            ledgers: summary.ledgers.skipped,
            parties: summary.parties.skipped,
            items: summary.items.skipped,
            vouchers: summary.vouchers.skipped,
          },
        },
      });
      return summary;
    }, { timeout: 30_000, maxWait: 5_000 });

    return NextResponse.json({ ok: true, summary: result });
  } catch (error) {
    logger.error({ err: error }, "Tally import failed");
    return NextResponse.json(
      {
        error: "Tally import failed",
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
});
