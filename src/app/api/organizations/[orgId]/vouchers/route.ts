import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { D, sum, closeEnough } from "@/backend/utils/money";
import { applyLedgerEntries } from "@/backend/utils/posting";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const voucherEntrySchema = z.object({
  ledgerId: z.string().min(1, "Ledger is required"),
  debitAmount: z.union([z.number().min(0), z.string()]).default(0).transform((v) => D(v)),
  creditAmount: z.union([z.number().min(0), z.string()]).default(0).transform((v) => D(v)),
  narration: z.string().optional(),
  costCenterId: z.string().optional(),
  projectId: z.string().optional(),
});

const createVoucherSchema = z.object({
  voucherTypeId: z.string().min(1, "Voucher type is required"),
  fiscalYearId: z.string().min(1, "Fiscal year is required"),
  date: z.string().min(1, "Date is required"),
  narration: z.string().optional(),
  referenceNo: z.string().optional(),
  branchId: z.string().optional(),
  entries: z.array(voucherEntrySchema).min(2, "At least 2 entries required"),
});

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const voucherTypeId = searchParams.get("voucherTypeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (voucherTypeId) {
      where.voucherTypeId = voucherTypeId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { voucherNumber: { contains: search, mode: "insensitive" } },
        { narration: { contains: search, mode: "insensitive" } },
        { referenceNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: {
          voucherType: {
            select: {
              id: true,
              name: true,
              code: true,
              nature: true,
            },
          },
          entries: {
            include: {
              ledger: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.voucher.count({ where }),
    ]);

    return NextResponse.json({
      data: vouchers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching vouchers");
    return NextResponse.json(
      { error: "Failed to fetch vouchers" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const validatedData = createVoucherSchema.parse(body);

    // Double-entry balance check, in Decimal.
    const totalDebit = sum(validatedData.entries.map((e) => e.debitAmount));
    const totalCredit = sum(validatedData.entries.map((e) => e.creditAmount));
    if (!closeEnough(totalDebit, totalCredit)) {
      return badRequest("Total debit must equal total credit");
    }

    const voucherType = await prisma.voucherType.findUnique({
      where: { id: validatedData.voucherTypeId },
      select: { id: true, numberingPrefix: true, requiresApproval: true },
    });
    if (!voucherType) return badRequest("Invalid voucher type");

    // Confirm fiscal year belongs to this organization (prevents cross-tenant leak via fiscalYearId).
    const fyOk = await prisma.fiscalYear.findFirst({
      where: { id: validatedData.fiscalYearId, organizationId: orgId },
      select: { id: true },
    });
    if (!fyOk) return badRequest("Fiscal year not found in this organization");

    const date = new Date(validatedData.date);
    const requiresApproval = voucherType.requiresApproval;

    const voucher = await prisma.$transaction(async (tx) => {
      // Voucher numbering: read last under same (org, type, fy), increment.
      // Race-prone in theory; Postgres sequences will replace this.
      const lastVoucher = await tx.voucher.findFirst({
        where: {
          organizationId: orgId,
          voucherTypeId: validatedData.voucherTypeId,
          fiscalYearId: validatedData.fiscalYearId,
        },
        orderBy: { createdAt: "desc" },
        select: { voucherNumber: true },
      });
      const nextNumber = lastVoucher
        ? parseInt(lastVoucher.voucherNumber.split("/").pop() || "0", 10) + 1
        : 1;
      const voucherNumber = `${voucherType.numberingPrefix ?? "VCH/"}${new Date().getFullYear()}/${String(nextNumber).padStart(5, "0")}`;

      const newVoucher = await tx.voucher.create({
        data: {
          organizationId: orgId,
          voucherTypeId: validatedData.voucherTypeId,
          fiscalYearId: validatedData.fiscalYearId,
          voucherNumber,
          date,
          narration: validatedData.narration,
          referenceNo: validatedData.referenceNo,
          branchId: validatedData.branchId,
          totalDebit,
          totalCredit,
          status: requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
          isPosted: !requiresApproval,
          postedAt: requiresApproval ? null : new Date(),
          createdById: userId,
          entries: {
            create: validatedData.entries.map((entry, index) => ({
              ledgerId: entry.ledgerId,
              debitAmount: entry.debitAmount,
              creditAmount: entry.creditAmount,
              narration: entry.narration,
              costCenterId: entry.costCenterId,
              projectId: entry.projectId,
              sequence: index + 1,
            })),
          },
        },
        include: {
          voucherType: true,
          entries: { include: { ledger: true } },
        },
      });

      // Apply balance impact only when the voucher is posted (skip if pending approval).
      if (!requiresApproval) {
        await applyLedgerEntries(
          tx,
          validatedData.entries.map((e) => ({
            ledgerId: e.ledgerId,
            debitAmount: e.debitAmount,
            creditAmount: e.creditAmount,
          }))
        );
      }

      return newVoucher;
    });

    return NextResponse.json(voucher, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating voucher");
    return NextResponse.json(
      { error: "Failed to create voucher" },
      { status: 500 }
    );
  }
});
