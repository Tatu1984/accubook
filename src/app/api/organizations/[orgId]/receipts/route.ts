import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { D } from "@/backend/utils/money";
import {
  applyLedgerEntries,
  formatNumber,
  generateVoucherNumber,
  getCashLedger,
  getFiscalYearForDate,
  getOrCreateBankLedger,
  getOrCreatePartyLedger,
  getTcsPayableLedger,
  getVoucherTypeByCode,
  nextNumber,
  recomputeInvoiceStatus,
} from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";
import {
  computeTds,
  TCS_COLLECTION_SECTIONS,
  type DeducteeType,
  type TdsSectionCode,
} from "@/backend/services/tax/tds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receipts only accept TCS section codes (sourced from
// `TCS_COLLECTION_SECTIONS` in tds.ts) — TDS sections are deducted
// by the payer at payment time, not by the seller at receipt time.
// Narrow union here prevents a customer-receipt accidentally
// booking a TDS-Payable line via a mistyped section.
const createReceiptSchema = z.object({
  partyId: z.string().min(1, "Party is required"),
  invoiceId: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
  amount: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  paymentMode: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "UPI", "CARD"]),
  bankAccountId: z.string().optional(),
  chequeNo: z.string().optional(),
  chequeDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
  // Optional TCS at receipt time. When `tcsSection` is set, we compute
  // TCS via computeTds() against the buyer's YTD aggregate, then post a
  // 3-line voucher (Dr Bank gross / Cr Party amount / Cr TCS Payable)
  // instead of the usual 2-line one. `amount` remains the invoice value
  // applied to AR; the buyer actually remits amount + tcs.
  tcsSection: z.enum(TCS_COLLECTION_SECTIONS).optional(),
  deducteeType: z.enum(["INDIVIDUAL_HUF", "COMPANY_OTHER"]).optional(),
  noPan: z.boolean().optional(),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get("partyId");
    const status = searchParams.get("status");
    const paymentMode = searchParams.get("paymentMode");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = { organizationId: orgId };
    if (partyId) where.partyId = partyId;
    if (status) where.status = status;
    if (paymentMode) where.paymentMode = paymentMode;
    if (search) {
      where.OR = [
        { receiptNumber: { contains: search, mode: "insensitive" } },
        { transactionRef: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.receipt.count({ where }),
    ]);

    return NextResponse.json({
      data: receipts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching receipts");
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const validatedData = createReceiptSchema.parse(await request.json());

    const party = await prisma.party.findFirst({
      where: { id: validatedData.partyId, organizationId: orgId },
      select: { id: true, name: true, type: true },
    });
    if (!party) return notFound("Party not found");

    const isCash = validatedData.paymentMode === "CASH";
    if (!isCash && !validatedData.bankAccountId) {
      return badRequest("bankAccountId is required for non-cash receipt modes");
    }
    let bankAccount: { id: string; name: string } | null = null;
    if (validatedData.bankAccountId) {
      bankAccount = await prisma.bankAccount.findFirst({
        where: { id: validatedData.bankAccountId, organizationId: orgId },
        select: { id: true, name: true },
      });
      if (!bankAccount) return notFound("Bank account not found");
    }

    let invoice: { id: string; amountDue: import("@/generated/prisma").Prisma.Decimal } | null = null;
    if (validatedData.invoiceId) {
      const found = await prisma.invoice.findFirst({
        where: { id: validatedData.invoiceId, organizationId: orgId, partyId: party.id },
        select: { id: true, amountDue: true },
      });
      if (!found) return notFound("Invoice not found for this party");
      invoice = found;
      if (D(validatedData.amount).greaterThan(D(found.amountDue))) {
        return badRequest("Receipt amount exceeds the invoice's outstanding balance");
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Resolve double-entry ledgers.
      const partyLedger = await getOrCreatePartyLedger(
        tx,
        orgId,
        party.id,
        party.name,
        // Force CUSTOMER side (Sundry Debtors) for receipts even on BOTH-typed parties.
        party.type === "VENDOR" ? "VENDOR" : "CUSTOMER"
      );
      const cashOrBankLedger = isCash
        ? await getCashLedger(tx, orgId)
        : await getOrCreateBankLedger(tx, orgId, bankAccount!.id, bankAccount!.name);

      const voucherType = await getVoucherTypeByCode(tx, "RECEIPT");
      const fy = await getFiscalYearForDate(tx, orgId, validatedData.date);

      const voucherNumber = await generateVoucherNumber(
        tx,
        orgId,
        voucherType.id,
        fy.id,
        "RCV"
      );
      const receiptNumber = formatNumber("RCT", await nextNumber(tx, orgId, "RECEIPT"));

      // TCS pre-flight (if requested). Compute the collection amount
      // BEFORE building the voucher so we know whether to add a 3rd Cr
      // line and increase the bank movement.
      const amount = D(validatedData.amount);
      let tcsAmount = D(0);
      let tcsRate = D(0);
      let tcsLedgerId: string | null = null;
      let tcsRationale: string | null = null;
      if (validatedData.tcsSection) {
        const deducteeType: DeducteeType = validatedData.deducteeType ?? "COMPANY_OTHER";
        // YTD aggregate of past receipts from this buyer in the current
        // FY for the threshold check (206C(1H) is per-FY).
        const ytd = await tx.receipt.aggregate({
          where: {
            organizationId: orgId,
            partyId: party.id,
            date: { gte: fy.startDate, lte: validatedData.date },
            status: "COMPLETED",
          },
          _sum: { amount: true },
        });
        const ytdAggregate = D(ytd._sum.amount ?? 0);
        const tcsResult = computeTds({
          section: validatedData.tcsSection as TdsSectionCode,
          deducteeType,
          amount,
          ytdAggregate,
          noPan: validatedData.noPan,
        });
        tcsAmount = D(tcsResult.amount);
        tcsRate = D(tcsResult.rate);
        tcsRationale = tcsResult.appliedReason;
        if (tcsResult.amount.greaterThan(D(0))) {
          const tcsLedger = await getTcsPayableLedger(tx, orgId);
          tcsLedgerId = tcsLedger.id;
        }
      }
      const bankGrossAmount = amount.plus(tcsAmount);

      // Voucher entries:
      //   Without TCS:  Dr Bank/Cash (amount)              / Cr Party (amount)
      //   With TCS:     Dr Bank/Cash (amount + tcs)        / Cr Party (amount) / Cr TCS Payable (tcs)
      const voucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          fiscalYearId: fy.id,
          voucherTypeId: voucherType.id,
          voucherNumber,
          date: validatedData.date,
          referenceNo: validatedData.transactionRef,
          narration: validatedData.notes,
          totalDebit: bankGrossAmount,
          totalCredit: bankGrossAmount,
          status: "APPROVED",
          isPosted: true,
          postedAt: new Date(),
          createdById: userId,
        },
        select: { id: true },
      });

      const voucherEntries: Array<{
        voucherId: string;
        ledgerId: string;
        debitAmount: import("@/generated/prisma").Prisma.Decimal;
        creditAmount: import("@/generated/prisma").Prisma.Decimal;
        sequence: number;
        billRef?: string | null;
      }> = [
        {
          voucherId: voucher.id,
          ledgerId: cashOrBankLedger.id,
          debitAmount: bankGrossAmount,
          creditAmount: D(0),
          sequence: 0,
        },
        {
          voucherId: voucher.id,
          ledgerId: partyLedger.id,
          debitAmount: D(0),
          creditAmount: amount,
          sequence: 1,
          billRef: invoice?.id ?? null,
        },
      ];
      if (tcsLedgerId && tcsAmount.greaterThan(D(0))) {
        voucherEntries.push({
          voucherId: voucher.id,
          ledgerId: tcsLedgerId,
          debitAmount: D(0),
          creditAmount: tcsAmount,
          sequence: 2,
        });
      }
      await tx.voucherEntry.createMany({ data: voucherEntries });

      const balanceEntries = [
        { ledgerId: cashOrBankLedger.id, debitAmount: bankGrossAmount, creditAmount: D(0) },
        { ledgerId: partyLedger.id, debitAmount: D(0), creditAmount: amount },
      ];
      if (tcsLedgerId && tcsAmount.greaterThan(D(0))) {
        balanceEntries.push({
          ledgerId: tcsLedgerId,
          debitAmount: D(0),
          creditAmount: tcsAmount,
        });
      }
      await applyLedgerEntries(tx, balanceEntries);

      if (bankAccount) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { currentBalance: { increment: bankGrossAmount } },
        });
      }

      const receipt = await tx.receipt.create({
        data: {
          organizationId: orgId,
          receiptNumber,
          partyId: party.id,
          invoiceId: invoice?.id,
          voucherId: voucher.id,
          date: validatedData.date,
          amount,
          paymentMode: validatedData.paymentMode,
          bankAccountId: bankAccount?.id,
          chequeNo: validatedData.chequeNo,
          chequeDate: validatedData.chequeDate,
          transactionRef: validatedData.transactionRef,
          notes: validatedData.notes,
          status: "COMPLETED",
        },
        include: {
          party: true,
          invoice: true,
          bankAccount: true,
        },
      });

      // Persist the TCS collection row (queryable source for Form
      // 27D + 26AS reconciliation).
      if (validatedData.tcsSection && tcsAmount.greaterThan(D(0))) {
        await tx.tcsCollection.create({
          data: {
            organizationId: orgId,
            receiptId: receipt.id,
            partyId: party.id,
            voucherId: voucher.id,
            fiscalYearId: fy.id,
            section: validatedData.tcsSection,
            deducteeType: validatedData.deducteeType ?? "COMPANY_OTHER",
            ratePercent: tcsRate,
            baseAmount: amount,
            taxAmount: tcsAmount,
            noPan: validatedData.noPan ?? false,
            rationale: tcsRationale ?? "DEDUCTED",
            collectedAt: validatedData.date,
          },
        });
      }

      if (invoice) {
        await tx.invoicePayment.create({
          data: {
            invoiceId: invoice.id,
            voucherId: voucher.id,
            amount,
            date: validatedData.date,
          },
        });
        await recomputeInvoiceStatus(tx, invoice.id);
      }

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "Receipt",
        entityId: receipt.id,
        newData: {
          receiptNumber,
          partyId: party.id,
          invoiceId: invoice?.id,
          amount: amount.toString(),
          paymentMode: validatedData.paymentMode,
          voucherId: voucher.id,
          ...(validatedData.tcsSection
            ? {
                tcsSection: validatedData.tcsSection,
                tcsAmount: tcsAmount.toString(),
                tcsRationale,
                bankGrossAmount: bankGrossAmount.toString(),
              }
            : {}),
        },
      });

      return receipt;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof Error && error.message.includes("not configured")) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error creating receipt");
    return NextResponse.json({ error: "Failed to create receipt" }, { status: 500 });
  }
});
