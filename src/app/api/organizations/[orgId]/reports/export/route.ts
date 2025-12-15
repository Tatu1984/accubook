import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportFormat = "xlsx" | "csv" | "json";
type ReportType = "trial-balance" | "profit-loss" | "balance-sheet" | "cash-flow" | "aging" | "invoices" | "bills" | "ledger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
            voucher: { organizationId: orgId, date: { lte: asOfDate }, status: { in: ["APPROVED", "DRAFT"] } },
          },
          include: { voucher: { select: { date: true } } },
        });

        data = ledgers.map((ledger) => {
          const ledgerEntries = entries.filter(e => e.ledgerId === ledger.id);
          const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);

          const openingBalance = Number(ledger.openingBalance) || 0;
          let openingDr = ledger.openingBalanceType === "DR" || (isDebitNature && !ledger.openingBalanceType) ? openingBalance : 0;
          let openingCr = ledger.openingBalanceType === "CR" || (!isDebitNature && !ledger.openingBalanceType) ? openingBalance : 0;

          const beforeFY = ledgerEntries.filter(e => e.voucher.date < fyStart);
          openingDr += beforeFY.reduce((s, e) => s + Number(e.debitAmount), 0);
          openingCr += beforeFY.reduce((s, e) => s + Number(e.creditAmount), 0);

          const period = ledgerEntries.filter(e => e.voucher.date >= fyStart && e.voucher.date <= asOfDate);
          const debit = period.reduce((s, e) => s + Number(e.debitAmount), 0);
          const credit = period.reduce((s, e) => s + Number(e.creditAmount), 0);

          const totalDr = openingDr + debit;
          const totalCr = openingCr + credit;
          const closingDr = totalDr > totalCr ? totalDr - totalCr : 0;
          const closingCr = totalCr > totalDr ? totalCr - totalDr : 0;

          return {
            "Ledger Name": ledger.name,
            "Group": ledger.group.name,
            "Nature": ledger.group.nature,
            "Opening Dr": openingDr,
            "Opening Cr": openingCr,
            "Debit": debit,
            "Credit": credit,
            "Closing Dr": closingDr,
            "Closing Cr": closingCr,
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
            voucher: { organizationId: orgId, date: { gte: startDate, lte: endDate }, status: { in: ["APPROVED", "DRAFT"] } },
          },
        });

        let totalIncome = 0;
        let totalDirectExpenses = 0;
        let totalIndirectExpenses = 0;

        const incomeData: Record<string, unknown>[] = [{ Particulars: "=== INCOME ===", Amount: "" }];
        const directExpData: Record<string, unknown>[] = [{ Particulars: "=== DIRECT EXPENSES ===", Amount: "" }];
        const indirectExpData: Record<string, unknown>[] = [{ Particulars: "=== INDIRECT EXPENSES ===", Amount: "" }];

        ledgers.forEach((ledger) => {
          const ledgerEntries = entries.filter(e => e.ledgerId === ledger.id);
          const debit = ledgerEntries.reduce((s, e) => s + Number(e.debitAmount), 0);
          const credit = ledgerEntries.reduce((s, e) => s + Number(e.creditAmount), 0);
          const amount = ledger.group.nature === "INCOME" ? credit - debit : debit - credit;

          if (amount !== 0) {
            const row = { Particulars: ledger.name, Amount: amount };
            if (ledger.group.nature === "INCOME") {
              incomeData.push(row);
              totalIncome += amount;
            } else if (ledger.group.affectsGrossProfit) {
              directExpData.push(row);
              totalDirectExpenses += amount;
            } else {
              indirectExpData.push(row);
              totalIndirectExpenses += amount;
            }
          }
        });

        const grossProfit = totalIncome - totalDirectExpenses;
        const netProfit = grossProfit - totalIndirectExpenses;

        data = [
          ...incomeData,
          { Particulars: "Total Income", Amount: totalIncome },
          { Particulars: "", Amount: "" },
          ...directExpData,
          { Particulars: "Total Direct Expenses", Amount: totalDirectExpenses },
          { Particulars: "", Amount: "" },
          { Particulars: "GROSS PROFIT", Amount: grossProfit },
          { Particulars: "", Amount: "" },
          ...indirectExpData,
          { Particulars: "Total Indirect Expenses", Amount: totalIndirectExpenses },
          { Particulars: "", Amount: "" },
          { Particulars: "NET PROFIT", Amount: netProfit },
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
          "Total": Number(inv.totalAmount),
          "Paid": Number(inv.amountPaid),
          "Due": Number(inv.amountDue),
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
          "Total": Number(bill.totalAmount),
          "Paid": Number(bill.amountPaid),
          "Due": Number(bill.amountDue),
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

          const partyMap = new Map<string, { name: string; current: number; d1to30: number; d31to60: number; d61to90: number; over90: number; }>();
          const today = new Date();

          invoices.forEach(inv => {
            const dueDate = new Date(inv.dueDate);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const amountDue = Number(inv.totalAmount) - Number(inv.amountPaid);

            if (!partyMap.has(inv.partyId)) {
              partyMap.set(inv.partyId, { name: inv.party.name, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0 });
            }
            const party = partyMap.get(inv.partyId)!;

            if (daysOverdue <= 0) party.current += amountDue;
            else if (daysOverdue <= 30) party.d1to30 += amountDue;
            else if (daysOverdue <= 60) party.d31to60 += amountDue;
            else if (daysOverdue <= 90) party.d61to90 += amountDue;
            else party.over90 += amountDue;
          });

          data = Array.from(partyMap.values()).map(p => ({
            "Party": p.name,
            "Current": p.current,
            "1-30 Days": p.d1to30,
            "31-60 Days": p.d31to60,
            "61-90 Days": p.d61to90,
            "Over 90 Days": p.over90,
            "Total": p.current + p.d1to30 + p.d31to60 + p.d61to90 + p.over90,
          }));
        } else {
          const bills = await prisma.bill.findMany({
            where: { organizationId: orgId, status: { in: ["PENDING_APPROVAL", "APPROVED", "PARTIAL", "OVERDUE"] } },
            include: { party: { select: { name: true } } },
          });

          const partyMap = new Map<string, { name: string; current: number; d1to30: number; d31to60: number; d61to90: number; over90: number; }>();
          const today = new Date();

          bills.forEach(bill => {
            const dueDate = new Date(bill.dueDate);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const amountDue = Number(bill.totalAmount) - Number(bill.amountPaid);

            if (!partyMap.has(bill.partyId)) {
              partyMap.set(bill.partyId, { name: bill.party.name, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0 });
            }
            const party = partyMap.get(bill.partyId)!;

            if (daysOverdue <= 0) party.current += amountDue;
            else if (daysOverdue <= 30) party.d1to30 += amountDue;
            else if (daysOverdue <= 60) party.d31to60 += amountDue;
            else if (daysOverdue <= 90) party.d61to90 += amountDue;
            else party.over90 += amountDue;
          });

          data = Array.from(partyMap.values()).map(p => ({
            "Party": p.name,
            "Current": p.current,
            "1-30 Days": p.d1to30,
            "31-60 Days": p.d31to60,
            "61-90 Days": p.d61to90,
            "Over 90 Days": p.over90,
            "Total": p.current + p.d1to30 + p.d31to60 + p.d61to90 + p.over90,
          }));
        }
        break;
      }

      case "ledger": {
        const ledgerId = filters.ledgerId;
        if (!ledgerId) {
          return NextResponse.json({ error: "Ledger ID required" }, { status: 400 });
        }

        const ledger = await prisma.ledger.findUnique({
          where: { id: ledgerId },
          include: { group: { select: { name: true, nature: true } } },
        });

        if (!ledger) {
          return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
        }

        sheetName = `Ledger - ${ledger.name}`;
        headers = ["Date", "Voucher No", "Type", "Narration", "Debit", "Credit", "Balance"];

        const startDate = filters.startDate ? new Date(filters.startDate) : new Date(new Date().getFullYear(), 3, 1);
        const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

        const entries = await prisma.voucherEntry.findMany({
          where: {
            ledgerId,
            voucher: { date: { gte: startDate, lte: endDate }, status: { in: ["APPROVED", "DRAFT"] } },
          },
          include: {
            voucher: {
              select: { voucherNumber: true, date: true, narration: true, voucherType: { select: { name: true } } },
            },
          },
          orderBy: { voucher: { date: "asc" } },
        });

        let runningBalance = Number(ledger.openingBalance) || 0;
        const isDebitNature = ["ASSETS", "EXPENSES"].includes(ledger.group.nature);
        if (ledger.openingBalanceType === "CR" || (!isDebitNature && !ledger.openingBalanceType)) {
          runningBalance = -runningBalance;
        }

        data = [
          { Date: startDate.toISOString().split("T")[0], "Voucher No": "", Type: "Opening Balance", Narration: "", Debit: "", Credit: "", Balance: runningBalance },
          ...entries.map(entry => {
            const debit = Number(entry.debitAmount);
            const credit = Number(entry.creditAmount);
            runningBalance += debit - credit;
            return {
              Date: entry.voucher.date.toISOString().split("T")[0],
              "Voucher No": entry.voucher.voucherNumber,
              Type: entry.voucher.voucherType.name,
              Narration: entry.narration || entry.voucher.narration || "",
              Debit: debit || "",
              Credit: credit || "",
              Balance: runningBalance,
            };
          }),
        ];
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    // Generate file based on format
    if (format === "json") {
      return NextResponse.json({ data, headers, sheetName });
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    // Add header row with organization info
    XLSX.utils.sheet_add_aoa(worksheet, [
      [organization?.name || ""],
      [organization?.address || ""],
      [organization?.gstNo ? `GSTIN: ${organization.gstNo}` : ""],
      [sheetName],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
    ], { origin: "A1" });

    // Shift data down
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    range.s.r = 6; // Start data from row 7
    worksheet["!ref"] = XLSX.utils.encode_range(range);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${sheetName.replace(/\s/g, "_")}_${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // Default to XLSX
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${sheetName.replace(/\s/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error exporting report:", error);
    return NextResponse.json(
      { error: "Failed to export report" },
      { status: 500 }
    );
  }
}
