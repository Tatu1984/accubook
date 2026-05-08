import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { D, sum, toNumber } from "@/backend/utils/money";
import { Prisma } from "@/generated/prisma";
import ExcelJS from "exceljs";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportFormat = "xlsx" | "csv" | "json";
type ReportType = "trial-balance" | "profit-loss" | "balance-sheet" | "cash-flow" | "aging" | "invoices" | "bills" | "ledger";

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { reportType, format = "xlsx", filters = {} } = body as {
      reportType: ReportType;
      format: ExportFormat;
      filters: Record<string, string>;
    };

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, gstNo: true, address: true },
    });

    let data: Record<string, unknown>[] = [];
    let sheetName = "Report";
    let headers: string[] = [];

    switch (reportType) {
      case "trial-balance": {
        sheetName = "Trial Balance";
        headers = ["Ledger Name", "Group", "Nature", "Opening Dr", "Opening Cr", "Debit", "Credit", "Closing Dr", "Closing Cr"];

        const ledgers = await prisma.ledger.findMany({
          where: { organizationId: orgId, isActive: true },
          include: { group: { select: { name: true, nature: true } } },
          orderBy: [{ group: { nature: "asc" } }, { name: "asc" }],
        });

        const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();
        const fyStart = asOfDate.getMonth() >= 3
          ? new Date(asOfDate.getFullYear(), 3, 1)
          : new Date(asOfDate.getFullYear() - 1, 3, 1);

        const entries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId: { in: ledgers.map(l => l.id) },
            voucher: { organizationId: orgId, date: { lte: asOfDate }, status: "APPROVED" },
          },
          include: { voucher: { select: { date: true } } },
        });

        data = ledgers.map((ledger) => {
          const ledgerEntries = entries.filter(e => e.ledgerId === ledger.id);
          const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);

          const openingBalance = D(ledger.openingBalance ?? 0);
          let openingDr = ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType) ? openingBalance : D(0);
          let openingCr = ledger.openingBalanceType === "CR" || (!isDebitNature && !ledger.openingBalanceType) ? openingBalance : D(0);

          const beforeFY = ledgerEntries.filter(e => e.voucher.date < fyStart);
          openingDr = openingDr.plus(sum(beforeFY.map((e) => e.debitAmount)));
          openingCr = openingCr.plus(sum(beforeFY.map((e) => e.creditAmount)));

          const period = ledgerEntries.filter(e => e.voucher.date >= fyStart && e.voucher.date <= asOfDate);
          const debit = sum(period.map((e) => e.debitAmount));
          const credit = sum(period.map((e) => e.creditAmount));

          const totalDr = openingDr.plus(debit);
          const totalCr = openingCr.plus(credit);
          const closingDr = totalDr.greaterThan(totalCr) ? totalDr.minus(totalCr) : D(0);
          const closingCr = totalCr.greaterThan(totalDr) ? totalCr.minus(totalDr) : D(0);

          return {
            "Ledger Name": ledger.name,
            "Group": ledger.group.name,
            "Nature": ledger.group.nature,
            "Opening Dr": toNumber(openingDr),
            "Opening Cr": toNumber(openingCr),
            "Debit": toNumber(debit),
            "Credit": toNumber(credit),
            "Closing Dr": toNumber(closingDr),
            "Closing Cr": toNumber(closingCr),
          };
        }).filter(row =>
          row["Opening Dr"] !== 0 || row["Opening Cr"] !== 0 ||
          row["Debit"] !== 0 || row["Credit"] !== 0
        );
        break;
      }

      case "profit-loss": {
        sheetName = "Profit & Loss";
        headers = ["Particulars", "Amount"];

        const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().getFullYear(), 3, 1);
        const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

        const ledgers = await prisma.ledger.findMany({
          where: { organizationId: orgId, isActive: true, group: { nature: { in: ["INCOME", "EXPENSES"] } } },
          include: { group: { select: { name: true, nature: true, affectsGrossProfit: true } } },
        });

        const entries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId: { in: ledgers.map(l => l.id) },
            voucher: { organizationId: orgId, date: { gte: startDate, lte: endDate }, status: "APPROVED" },
          },
        });

        let totalIncome = D(0);
        let totalDirectExpenses = D(0);
        let totalIndirectExpenses = D(0);

        const incomeData: Record<string, unknown>[] = [{ Particulars: "=== INCOME ===", Amount: "" }];
        const directExpData: Record<string, unknown>[] = [{ Particulars: "=== DIRECT EXPENSES ===", Amount: "" }];
        const indirectExpData: Record<string, unknown>[] = [{ Particulars: "=== INDIRECT EXPENSES ===", Amount: "" }];

        ledgers.forEach((ledger) => {
          const ledgerEntries = entries.filter(e => e.ledgerId === ledger.id);
          const debit = sum(ledgerEntries.map((e) => e.debitAmount));
          const credit = sum(ledgerEntries.map((e) => e.creditAmount));
          const amount = ledger.group.nature === "INCOME" ? credit.minus(debit) : debit.minus(credit);

          if (!amount.isZero()) {
            const row = { Particulars: ledger.name, Amount: toNumber(amount) };
            if (ledger.group.nature === "INCOME") {
              incomeData.push(row);
              totalIncome = totalIncome.plus(amount);
            } else if (ledger.group.affectsGrossProfit) {
              directExpData.push(row);
              totalDirectExpenses = totalDirectExpenses.plus(amount);
            } else {
              indirectExpData.push(row);
              totalIndirectExpenses = totalIndirectExpenses.plus(amount);
            }
          }
        });

        const grossProfit = totalIncome.minus(totalDirectExpenses);
        const netProfit = grossProfit.minus(totalIndirectExpenses);

        data = [
          ...incomeData,
          { Particulars: "Total Income", Amount: toNumber(totalIncome) },
          { Particulars: "", Amount: "" },
          ...directExpData,
          { Particulars: "Total Direct Expenses", Amount: toNumber(totalDirectExpenses) },
          { Particulars: "", Amount: "" },
          { Particulars: "GROSS PROFIT", Amount: toNumber(grossProfit) },
          { Particulars: "", Amount: "" },
          ...indirectExpData,
          { Particulars: "Total Indirect Expenses", Amount: toNumber(totalIndirectExpenses) },
          { Particulars: "", Amount: "" },
          { Particulars: "NET PROFIT", Amount: toNumber(netProfit) },
        ];
        break;
      }

      case "invoices": {
        sheetName = "Invoices";
        headers = ["Invoice No", "Date", "Due Date", "Customer", "Total", "Paid", "Due", "Status"];

        const invoices = await prisma.invoice.findMany({
          where: {
            organizationId: orgId,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.startDate && filters.endDate ? {
              date: { gte: new Date(filters.startDate), lte: new Date(filters.endDate) }
            } : {}),
          },
          include: { party: { select: { name: true } } },
          orderBy: { date: "desc" },
        });

        data = invoices.map(inv => ({
          "Invoice No": inv.invoiceNumber,
          "Date": inv.date.toISOString().split("T")[0],
          "Due Date": inv.dueDate.toISOString().split("T")[0],
          "Customer": inv.party.name,
          "Total": toNumber(inv.totalAmount),
          "Paid": toNumber(inv.amountPaid),
          "Due": toNumber(inv.amountDue),
          "Status": inv.status,
        }));
        break;
      }

      case "bills": {
        sheetName = "Bills";
        headers = ["Bill No", "Vendor Bill No", "Date", "Due Date", "Vendor", "Total", "Paid", "Due", "Status"];

        const bills = await prisma.bill.findMany({
          where: {
            organizationId: orgId,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.startDate && filters.endDate ? {
              date: { gte: new Date(filters.startDate), lte: new Date(filters.endDate) }
            } : {}),
          },
          include: { party: { select: { name: true } } },
          orderBy: { date: "desc" },
        });

        data = bills.map(bill => ({
          "Bill No": bill.billNumber,
          "Vendor Bill No": bill.vendorBillNo || "",
          "Date": bill.date.toISOString().split("T")[0],
          "Due Date": bill.dueDate.toISOString().split("T")[0],
          "Vendor": bill.party.name,
          "Total": toNumber(bill.totalAmount),
          "Paid": toNumber(bill.amountPaid),
          "Due": toNumber(bill.amountDue),
          "Status": bill.status,
        }));
        break;
      }

      case "aging": {
        const type = filters.type || "receivables";
        sheetName = type === "receivables" ? "Receivables Aging" : "Payables Aging";
        headers = ["Party", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90 Days", "Total"];

        if (type === "receivables") {
          const invoices = await prisma.invoice.findMany({
            where: { organizationId: orgId, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
            include: { party: { select: { name: true } } },
          });

          const partyMap = new Map<string, { name: string; current: Prisma.Decimal; d1to30: Prisma.Decimal; d31to60: Prisma.Decimal; d61to90: Prisma.Decimal; over90: Prisma.Decimal; }>();
          const today = new Date();

          invoices.forEach(inv => {
            const dueDate = new Date(inv.dueDate);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const amountDue = D(inv.totalAmount).minus(D(inv.amountPaid));

            if (!partyMap.has(inv.partyId)) {
              partyMap.set(inv.partyId, { name: inv.party.name, current: D(0), d1to30: D(0), d31to60: D(0), d61to90: D(0), over90: D(0) });
            }
            const party = partyMap.get(inv.partyId)!;

            if (daysOverdue <= 0) party.current = party.current.plus(amountDue);
            else if (daysOverdue <= 30) party.d1to30 = party.d1to30.plus(amountDue);
            else if (daysOverdue <= 60) party.d31to60 = party.d31to60.plus(amountDue);
            else if (daysOverdue <= 90) party.d61to90 = party.d61to90.plus(amountDue);
            else party.over90 = party.over90.plus(amountDue);
          });

          data = Array.from(partyMap.values()).map(p => ({
            "Party": p.name,
            "Current": toNumber(p.current),
            "1-30 Days": toNumber(p.d1to30),
            "31-60 Days": toNumber(p.d31to60),
            "61-90 Days": toNumber(p.d61to90),
            "Over 90 Days": toNumber(p.over90),
            "Total": toNumber(sum([p.current, p.d1to30, p.d31to60, p.d61to90, p.over90])),
          }));
        } else {
          const bills = await prisma.bill.findMany({
            where: { organizationId: orgId, status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL", "OVERDUE"] } },
            include: { party: { select: { name: true } } },
          });

          const partyMap = new Map<string, { name: string; current: Prisma.Decimal; d1to30: Prisma.Decimal; d31to60: Prisma.Decimal; d61to90: Prisma.Decimal; over90: Prisma.Decimal; }>();
          const today = new Date();

          bills.forEach(bill => {
            const dueDate = new Date(bill.dueDate);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const amountDue = D(bill.totalAmount).minus(D(bill.amountPaid));

            if (!partyMap.has(bill.partyId)) {
              partyMap.set(bill.partyId, { name: bill.party.name, current: D(0), d1to30: D(0), d31to60: D(0), d61to90: D(0), over90: D(0) });
            }
            const party = partyMap.get(bill.partyId)!;

            if (daysOverdue <= 0) party.current = party.current.plus(amountDue);
            else if (daysOverdue <= 30) party.d1to30 = party.d1to30.plus(amountDue);
            else if (daysOverdue <= 60) party.d31to60 = party.d31to60.plus(amountDue);
            else if (daysOverdue <= 90) party.d61to90 = party.d61to90.plus(amountDue);
            else party.over90 = party.over90.plus(amountDue);
          });

          data = Array.from(partyMap.values()).map(p => ({
            "Party": p.name,
            "Current": toNumber(p.current),
            "1-30 Days": toNumber(p.d1to30),
            "31-60 Days": toNumber(p.d31to60),
            "61-90 Days": toNumber(p.d61to90),
            "Over 90 Days": toNumber(p.over90),
            "Total": toNumber(sum([p.current, p.d1to30, p.d31to60, p.d61to90, p.over90])),
          }));
        }
        break;
      }

      case "ledger": {
        const ledgerId = filters.ledgerId;
        if (!ledgerId) {
          return badRequest("Ledger ID required");
        }

        const ledger = await prisma.ledger.findUnique({
          where: { id: ledgerId },
          include: { group: { select: { name: true, nature: true } } },
        });

        if (!ledger) {
          return notFound("Ledger not found");
        }

        sheetName = `Ledger - ${ledger.name}`;
        headers = ["Date", "Voucher No", "Type", "Narration", "Debit", "Credit", "Balance"];

        const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().getFullYear(), 3, 1);
        const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

        const entries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId,
            voucher: { date: { gte: startDate, lte: endDate }, status: "APPROVED" },
          },
          include: {
            voucher: {
              select: { voucherNumber: true, date: true, narration: true, voucherType: { select: { name: true } } },
            },
          },
          orderBy: { voucher: { date: "asc" } },
        });

        let runningBalance = D(ledger.openingBalance ?? 0);
        const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);
        if (ledger.openingBalanceType === "CR" || (!isDebitNature && !ledger.openingBalanceType)) {
          runningBalance = runningBalance.negated();
        }

        data = [
          { Date: startDate.toISOString().split("T")[0], "Voucher No": "", Type: "Opening Balance", Narration: "", Debit: "", Credit: "", Balance: toNumber(runningBalance) },
          ...entries.map(entry => {
            const debit = D(entry.debitAmount);
            const credit = D(entry.creditAmount);
            runningBalance = runningBalance.plus(debit).minus(credit);
            const debitNum = toNumber(debit);
            const creditNum = toNumber(credit);
            return {
              Date: entry.voucher.date.toISOString().split("T")[0],
              "Voucher No": entry.voucher.voucherNumber,
              Type: entry.voucher.voucherType.name,
              Narration: entry.narration || entry.voucher.narration || "",
              Debit: debitNum || "",
              Credit: creditNum || "",
              Balance: toNumber(runningBalance),
            };
          }),
        ];
        break;
      }

      default:
        return badRequest("Invalid report type");
    }

    // Generate file based on format
    if (format === "json") {
      return NextResponse.json({ data, headers, sheetName });
    }

    // Build the workbook with ExcelJS (replaced xlsx after CVE GHSA-4r6h-8v6p-xvw6
    // — write-only usage so the parse-side prototype-pollution wasn't reachable
    // for us, but exceljs is the maintained alternative anyway).
    const fileSafeName = sheetName.replace(/\s/g, "_");
    const today = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const headerRows = [
        [organization?.name || ""],
        [organization?.address || ""],
        [organization?.gstNo ? `GSTIN: ${organization.gstNo}` : ""],
        [sheetName],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
      ];
      const escape = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        ...headerRows.map((row) => row.map(escape).join(",")),
        headers.map(escape).join(","),
        ...data.map((d) =>
          headers.map((h) => escape((d as Record<string, unknown>)[h])).join(",")
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${fileSafeName}_${today}.csv"`,
        },
      });
    }

    // Default to XLSX (built with exceljs).
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AccuBook";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sheetName);

    // Org header
    sheet.addRow([organization?.name || ""]);
    sheet.addRow([organization?.address || ""]);
    sheet.addRow([organization?.gstNo ? `GSTIN: ${organization.gstNo}` : ""]);
    sheet.addRow([sheetName]);
    sheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
    sheet.addRow([]);

    // Column headers
    sheet.addRow(headers);

    // Data rows
    for (const row of data) {
      sheet.addRow(headers.map((h) => (row as Record<string, unknown>)[h] ?? ""));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileSafeName}_${today}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error exporting report");
    return NextResponse.json(
      { error: "Failed to export report" },
      { status: 500 }
    );
  }
});
