import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const computeGSTRSchema = z.object({
  returnType: z.enum(["GSTR1", "GSTR3B"]),
  period: z.string(), // "Apr-2024" or "Q1-2024"
  year: z.number(),
});

interface GSTR1Data {
  b2b: Array<{
    partyGstin: string;
    partyName: string;
    invoices: Array<{
      invoiceNumber: string;
      invoiceDate: string;
      invoiceValue: number;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
      cess: number;
    }>;
    totalTaxableValue: number;
    totalTax: number;
  }>;
  b2c: {
    invoices: Array<{
      invoiceNumber: string;
      invoiceDate: string;
      invoiceValue: number;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
    }>;
    totalTaxableValue: number;
    totalTax: number;
  };
  cdnr: Array<{
    partyGstin: string;
    partyName: string;
    notes: Array<{
      noteNumber: string;
      noteDate: string;
      noteType: string;
      noteValue: number;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
    }>;
  }>;
  hsn: Array<{
    hsnCode: string;
    description: string;
    uqc: string;
    totalQuantity: number;
    totalValue: number;
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
  }>;
  summary: {
    totalInvoices: number;
    totalTaxableValue: number;
    totalIgst: number;
    totalCgst: number;
    totalSgst: number;
    totalTax: number;
  };
}

interface GSTR3BData {
  outwardSupplies: {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
  inwardSupplies: {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
  itcAvailable: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    total: number;
  };
  itcReversed: {
    igst: number;
    cgst: number;
    sgst: number;
    total: number;
  };
  netTaxPayable: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    total: number;
  };
  interestLateFee: {
    interest: number;
    lateFee: number;
  };
}

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
    const validationResult = computeGSTRSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { returnType, period, year } = validationResult.data;

    // Parse period to get date range
    let startDate: Date;
    let endDate: Date;

    if (period.startsWith("Q")) {
      // Quarterly
      const quarter = parseInt(period.charAt(1));
      const monthStart = (quarter - 1) * 3 + 3; // Q1 = Apr (3), Q2 = Jul (6), etc.
      startDate = new Date(year, monthStart, 1);
      endDate = new Date(year, monthStart + 3, 0);
    } else {
      // Monthly
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthAbbr = period.split("-")[0];
      const monthIndex = monthNames.indexOf(monthAbbr);
      if (monthIndex === -1) {
        return NextResponse.json({ error: "Invalid period format" }, { status: 400 });
      }
      startDate = new Date(year, monthIndex, 1);
      endDate = new Date(year, monthIndex + 1, 0);
    }

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { gstNo: true, state: true },
    });

    if (!organization?.gstNo) {
      return NextResponse.json({ error: "Organization GSTIN not configured" }, { status: 400 });
    }

    const sellerStateCode = organization.gstNo.substring(0, 2);

    if (returnType === "GSTR1") {
      // Fetch all invoices for the period
      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          status: { not: "CANCELLED" },
        },
        include: {
          party: { select: { name: true, gstNo: true, billingState: true } },
          items: {
            include: {
              item: { select: { hsnCode: true, name: true } },
              tax: { select: { rate: true, taxType: true } },
            },
          },
          taxes: {
            include: {
              tax: { select: { taxType: true, rate: true } },
            },
          },
        },
      });

      // B2B - Business to Business (with GSTIN)
      const b2bMap = new Map<string, GSTR1Data["b2b"][0]>();

      // B2C - Business to Consumer (without GSTIN)
      const b2cInvoices: GSTR1Data["b2c"]["invoices"] = [];

      // HSN summary
      const hsnMap = new Map<string, GSTR1Data["hsn"][0]>();

      for (const invoice of invoices) {
        const buyerStateCode = invoice.party.gstNo
          ? invoice.party.gstNo.substring(0, 2)
          : "00";
        const isInterState = sellerStateCode !== buyerStateCode;

        // Calculate tax breakdown
        let igst = 0, cgst = 0, sgst = 0;
        const taxableValue = Number(invoice.subtotal);

        invoice.taxes.forEach(t => {
          const amount = Number(t.taxAmount);
          if (t.tax.taxType === "IGST") igst += amount;
          else if (t.tax.taxType === "CGST") cgst += amount;
          else if (t.tax.taxType === "SGST") sgst += amount;
        });

        // If no tax breakdown, estimate from total
        if (igst === 0 && cgst === 0 && sgst === 0) {
          const totalTax = Number(invoice.taxAmount);
          if (isInterState) {
            igst = totalTax;
          } else {
            cgst = totalTax / 2;
            sgst = totalTax / 2;
          }
        }

        const invoiceData = {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.date.toISOString().split("T")[0],
          invoiceValue: Number(invoice.totalAmount),
          taxableValue,
          igst,
          cgst,
          sgst,
          cess: 0,
        };

        if (invoice.party.gstNo && invoice.party.gstNo !== "URP") {
          // B2B
          if (!b2bMap.has(invoice.party.gstNo)) {
            b2bMap.set(invoice.party.gstNo, {
              partyGstin: invoice.party.gstNo,
              partyName: invoice.party.name,
              invoices: [],
              totalTaxableValue: 0,
              totalTax: 0,
            });
          }
          const b2b = b2bMap.get(invoice.party.gstNo)!;
          b2b.invoices.push(invoiceData);
          b2b.totalTaxableValue += taxableValue;
          b2b.totalTax += igst + cgst + sgst;
        } else {
          // B2C
          b2cInvoices.push(invoiceData);
        }

        // HSN summary
        for (const item of invoice.items) {
          const hsnCode = item.hsnCode || item.item?.hsnCode || "0000";
          if (!hsnMap.has(hsnCode)) {
            hsnMap.set(hsnCode, {
              hsnCode,
              description: item.description || item.item?.name || "",
              uqc: "NOS",
              totalQuantity: 0,
              totalValue: 0,
              taxableValue: 0,
              igst: 0,
              cgst: 0,
              sgst: 0,
            });
          }
          const hsn = hsnMap.get(hsnCode)!;
          hsn.totalQuantity += Number(item.quantity);
          hsn.totalValue += Number(item.totalAmount);
          hsn.taxableValue += Number(item.taxableAmount);

          const itemTax = Number(item.taxAmount);
          if (isInterState) {
            hsn.igst += itemTax;
          } else {
            hsn.cgst += itemTax / 2;
            hsn.sgst += itemTax / 2;
          }
        }
      }

      const gstr1Data: GSTR1Data = {
        b2b: Array.from(b2bMap.values()),
        b2c: {
          invoices: b2cInvoices,
          totalTaxableValue: b2cInvoices.reduce((sum, i) => sum + i.taxableValue, 0),
          totalTax: b2cInvoices.reduce((sum, i) => sum + i.igst + i.cgst + i.sgst, 0),
        },
        cdnr: [], // Credit/Debit notes - would need to query separately
        hsn: Array.from(hsnMap.values()),
        summary: {
          totalInvoices: invoices.length,
          totalTaxableValue: invoices.reduce((sum, i) => sum + Number(i.subtotal), 0),
          totalIgst: Array.from(b2bMap.values()).reduce((sum, b) => sum + b.invoices.reduce((s, i) => s + i.igst, 0), 0) +
            b2cInvoices.reduce((sum, i) => sum + i.igst, 0),
          totalCgst: Array.from(b2bMap.values()).reduce((sum, b) => sum + b.invoices.reduce((s, i) => s + i.cgst, 0), 0) +
            b2cInvoices.reduce((sum, i) => sum + i.cgst, 0),
          totalSgst: Array.from(b2bMap.values()).reduce((sum, b) => sum + b.invoices.reduce((s, i) => s + i.sgst, 0), 0) +
            b2cInvoices.reduce((sum, i) => sum + i.sgst, 0),
          totalTax: invoices.reduce((sum, i) => sum + Number(i.taxAmount), 0),
        },
      };

      return NextResponse.json({
        returnType: "GSTR1",
        period,
        year,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        data: gstr1Data,
      });
    }

    if (returnType === "GSTR3B") {
      // Fetch invoices (outward supplies)
      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          status: { not: "CANCELLED" },
        },
        include: {
          taxes: {
            include: {
              tax: { select: { taxType: true } },
            },
          },
        },
      });

      // Fetch bills (inward supplies / ITC)
      const bills = await prisma.bill.findMany({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          status: { not: "CANCELLED" },
        },
        include: {
          taxes: {
            include: {
              tax: { select: { taxType: true } },
            },
          },
        },
      });

      // Calculate outward supplies
      const outwardSupplies = {
        taxableValue: invoices.reduce((sum, i) => sum + Number(i.subtotal), 0),
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      };

      invoices.forEach(inv => {
        inv.taxes.forEach(t => {
          const amount = Number(t.taxAmount);
          if (t.tax.taxType === "IGST") outwardSupplies.igst += amount;
          else if (t.tax.taxType === "CGST") outwardSupplies.cgst += amount;
          else if (t.tax.taxType === "SGST") outwardSupplies.sgst += amount;
          else if (t.tax.taxType === "CESS") outwardSupplies.cess += amount;
        });
      });

      // Calculate inward supplies and ITC
      const inwardSupplies = {
        taxableValue: bills.reduce((sum, b) => sum + Number(b.subtotal), 0),
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      };

      bills.forEach(bill => {
        bill.taxes.forEach(t => {
          const amount = Number(t.taxAmount);
          if (t.tax.taxType === "IGST") inwardSupplies.igst += amount;
          else if (t.tax.taxType === "CGST") inwardSupplies.cgst += amount;
          else if (t.tax.taxType === "SGST") inwardSupplies.sgst += amount;
          else if (t.tax.taxType === "CESS") inwardSupplies.cess += amount;
        });
      });

      // ITC available (simplified - assumes all eligible)
      const itcAvailable = {
        igst: inwardSupplies.igst,
        cgst: inwardSupplies.cgst,
        sgst: inwardSupplies.sgst,
        cess: inwardSupplies.cess,
        total: inwardSupplies.igst + inwardSupplies.cgst + inwardSupplies.sgst + inwardSupplies.cess,
      };

      // Net tax payable
      const netTaxPayable = {
        igst: Math.max(0, outwardSupplies.igst - itcAvailable.igst),
        cgst: Math.max(0, outwardSupplies.cgst - itcAvailable.cgst),
        sgst: Math.max(0, outwardSupplies.sgst - itcAvailable.sgst),
        cess: Math.max(0, outwardSupplies.cess - itcAvailable.cess),
        total: 0,
      };
      netTaxPayable.total = netTaxPayable.igst + netTaxPayable.cgst + netTaxPayable.sgst + netTaxPayable.cess;

      const gstr3bData: GSTR3BData = {
        outwardSupplies,
        inwardSupplies,
        itcAvailable,
        itcReversed: { igst: 0, cgst: 0, sgst: 0, total: 0 },
        netTaxPayable,
        interestLateFee: { interest: 0, lateFee: 0 },
      };

      return NextResponse.json({
        returnType: "GSTR3B",
        period,
        year,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        data: gstr3bData,
        summary: {
          totalOutwardTax: outwardSupplies.igst + outwardSupplies.cgst + outwardSupplies.sgst,
          totalITC: itcAvailable.total,
          netPayable: netTaxPayable.total,
        },
      });
    }

    return NextResponse.json({ error: "Invalid return type" }, { status: 400 });
  } catch (error) {
    console.error("Error computing GST return:", error);
    return NextResponse.json({ error: "Failed to compute GST return" }, { status: 500 });
  }
}
