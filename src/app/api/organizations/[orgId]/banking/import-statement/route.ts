import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import {
  importParsedTxns,
  parseStatementCsv,
  type SupportedBank,
} from "@/backend/services/banking/statement-import";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED: SupportedBank[] = ["HDFC", "ICICI", "SBI", "AXIS", "GENERIC"];

/**
 * POST /api/organizations/[orgId]/banking/import-statement
 *
 * Multipart upload of a bank-statement CSV. Required fields:
 *   - file: the CSV
 *   - bankAccountId: target bank account
 *   - bank: one of HDFC / ICICI / SBI / AXIS / GENERIC
 *
 * OR raw CSV body with content-type text/csv plus the same fields as
 * query parameters. Idempotent — re-uploading the same file inserts no
 * new rows.
 */
export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  let csv: string;
  let bankAccountId: string | null = null;
  let bank: SupportedBank | null = null;

  const ctype = request.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const fd = await request.formData();
      const file = fd.get("file");
      bankAccountId = (fd.get("bankAccountId") as string | null)?.trim() ?? null;
      bank = ((fd.get("bank") as string | null)?.trim().toUpperCase() ?? null) as SupportedBank | null;
      if (!(file instanceof File)) {
        return badRequest("Multipart upload must include a 'file' field");
      }
      if (file.size > 10 * 1024 * 1024) {
        return badRequest("File too large (max 10 MB)");
      }
      csv = await file.text();
    } else if (ctype.includes("csv") || ctype.includes("text/plain")) {
      const url = new URL(request.url);
      bankAccountId = url.searchParams.get("bankAccountId");
      bank = (url.searchParams.get("bank")?.toUpperCase() ?? null) as SupportedBank | null;
      csv = await request.text();
    } else {
      return badRequest(
        "Content-Type must be multipart/form-data or text/csv"
      );
    }
  } catch (e) {
    return badRequest(`Failed to read upload: ${(e as Error).message}`);
  }

  if (!bankAccountId) return badRequest("bankAccountId is required");
  if (!bank || !SUPPORTED.includes(bank)) {
    return badRequest(`bank must be one of ${SUPPORTED.join(", ")}`);
  }
  if (!csv.trim()) return badRequest("Empty CSV");

  try {
    const { txns, warnings } = parseStatementCsv(csv, bank);
    if (txns.length === 0) {
      return badRequest(
        `No parseable transactions. ${warnings.join("; ")}`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const importResult = await importParsedTxns(tx, txns, {
        bankAccountId: bankAccountId!,
        organizationId: orgId,
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "BankStatementImport",
        newData: {
          bank,
          bankAccountId,
          parsed: importResult.parsed,
          inserted: importResult.inserted,
          skipped: importResult.skipped,
        },
      });
      return importResult;
    });

    return NextResponse.json({
      ok: true,
      bank,
      result,
      parserWarnings: warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "Bank statement import failed");
    return NextResponse.json(
      { error: "Bank statement import failed", message: (error as Error).message },
      { status: 500 }
    );
  }
});
