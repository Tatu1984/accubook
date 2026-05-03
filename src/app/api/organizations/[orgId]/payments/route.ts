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
  getVoucherTypeByCode,
  nextNumber,
  recomputeBillStatus,
} from "@/backend/utils/posting";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createPaymentSchema = z.object({
  partyId: z.string().min(1, "Party is required"),
  billId: z.string().optional(),
  date: z.string().transform((val) => new Date(val)),
  amount: z.union([z.number().positive(), z.string()]).transform((v) => D(v)),
  paymentMode: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "NEFT", "RTGS", "UPI"]),
  bankAccountId: z.string().optional(),
  chequeNo: z.string().optional(),
  chequeDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
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
        { paymentNumber: { contains: search, mode: "insensitive" } },
        { transactionRef: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, email: true } },
          bill: { select: { id: true, billNumber: true } },
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      data: payments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching payments");
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const validatedData = createPaymentSchema.parse(await request.json());

    // Resolve party first (outside tx) — fails fast on bad input.
    const party = await prisma.party.findFirst({
      where: { id: validatedData.partyId, organizationId: orgId },
      select: { id: true, name: true, type: true },
    });
    if (!party) return notFound("Party not found");

    // Bank vs cash sanity.
    const isCash = validatedData.paymentMode === "CASH";
    if (!isCash && !validatedData.bankAccountId) {
      return badRequest("bankAccountId is required for non-cash payment modes");
    }
    let bankAccount: { id: string; name: string } | null = null;
    if (validatedData.bankAccountId) {
      bankAccount = await prisma.bankAccount.findFirst({
        where: { id: validatedData.bankAccountId, organizationId: orgId },
        select: { id: true, name: true },
      });
      if (!bankAccount) return notFound("Bank account not found");
    }

    // Optional bill linkage. If supplied, must belong to the same party + org,
    // and the payment amount cannot exceed the outstanding balance.
    let bill: { id: string; amountDue: import("@/generated/prisma").Prisma.Decimal } | null = null;
    if (validatedData.billId) {
      const found = await prisma.bill.findFirst({
        where: { id: validatedData.billId, organizationId: orgId, partyId: party.id },
        select: { id: true, amountDue: true },
      });
      if (!found) return notFound("Bill not found for this party");
      bill = found;
      if (D(validatedData.amount).greaterThan(D(found.amountDue))) {
        return badRequest("Payment amount exceeds the bill's outstanding balance");
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve double-entry ledgers.
      const partyLedger = await getOrCreatePartyLedger(tx, orgId, party.id, party.name, party.type);
      const cashOrBankLedger = isCash
        ? await getCashLedger(tx, orgId)
        : await getOrCreateBankLedger(tx, orgId, bankAccount!.id, bankAccount!.name);

      // 2. Resolve voucher type + fiscal year.
      const voucherType = await getVoucherTypeByCode(tx, "PAYMENT");
      const fy = await getFiscalYearForDate(tx, orgId, validatedData.date);

      // 3. Generate voucher number, then payment number.
      const voucherNumber = await generateVoucherNumber(
        tx,
        orgId,
        voucherType.id,
        fy.id,
        "PAY"
      );
      const paymentNumber = formatNumber("PAY", await nextNumber(tx, orgId, "PAYMENT"));

      // 4. Create the voucher with two entries:
      //      Dr <Party Ledger> (reducing AP)
      //      Cr <Bank/Cash Ledger> (reducing bank)
      const amount = D(validatedData.amount);
      const voucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          fiscalYearId: fy.id,
          voucherTypeId: voucherType.id,
          voucherNumber,
          date: validatedData.date,
          referenceNo: validatedData.transactionRef,
          narration: validatedData.notes,
          totalDebit: amount,
          totalCredit: amount,
          status: "APPROVED",
          isPosted: true,
          postedAt: new Date(),
          createdById: userId,
        },
        select: { id: true },
      });

      await tx.voucherEntry.createMany({
        data: [
          {
            voucherId: voucher.id,
            ledgerId: partyLedger.id,
            debitAmount: amount,
            creditAmount: D(0),
            sequence: 0,
            billRef: bill?.id ?? null,
          },
          {
            voucherId: voucher.id,
            ledgerId: cashOrBankLedger.id,
            debitAmount: D(0),
            creditAmount: amount,
            sequence: 1,
          },
        ],
      });

      // 5. Apply ledger balance impact.
      await applyLedgerEntries(tx, [
        { ledgerId: partyLedger.id, debitAmount: amount, creditAmount: D(0) },
        { ledgerId: cashOrBankLedger.id, debitAmount: D(0), creditAmount: amount },
      ]);

      // 6. Update BankAccount.currentBalance for the banking dashboard.
      if (bankAccount) {
        await tx.bankAccount.update({
          where: { id: bankAccount.id },
          data: { currentBalance: { decrement: amount } },
        });
      }

      // 7. Create the payment record, linked to the voucher.
      const payment = await tx.payment.create({
        data: {
          organizationId: orgId,
          paymentNumber,
          partyId: party.id,
          billId: bill?.id,
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
          bill: true,
          bankAccount: true,
        },
      });

      // 8. If linked to a bill, create the InvoicePayment junction and recompute bill status.
      if (bill) {
        await tx.invoicePayment.create({
          data: {
            billId: bill.id,
            voucherId: voucher.id,
            amount,
            date: validatedData.date,
          },
        });
        await recomputeBillStatus(tx, bill.id);
      }

      // 9. Audit trail.
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "CREATE",
        entityType: "Payment",
        entityId: payment.id,
        newData: {
          paymentNumber,
          partyId: party.id,
          billId: bill?.id,
          amount: amount.toString(),
          paymentMode: validatedData.paymentMode,
          voucherId: voucher.id,
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    if (error instanceof Error && error.message.includes("not configured")) {
      return badRequest(error.message);
    }
    logger.error({ err: error }, "Error creating payment");
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
});

