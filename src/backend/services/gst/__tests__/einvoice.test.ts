import { describe, expect, it } from "vitest";
import { buildEInvoicePayload, EInvoiceValidationError } from "../einvoice";

function stubDb(invoice: unknown) {
  return {
    invoice: {
      findFirst: async () => invoice,
    },
  } as unknown as Parameters<typeof buildEInvoicePayload>[0];
}

const validOrg = {
  id: "org-1",
  name: "Acme",
  legalName: "Acme Pvt Ltd",
  gstNo: "27AAAAA0000A1Z5",
  address: "123 Main St",
  city: "Mumbai",
  state: "MH",
  postalCode: "400001",
  phone: "9999999999",
  email: "ops@acme.in",
};

const validBuyer = {
  id: "p-1",
  name: "Big Buyer",
  gstNo: "29AAAAA0000A1Z5",
  billingAddress: "456 Big St",
  billingCity: "Bangalore",
  billingState: "KA",
  billingPostal: "560001",
  phone: "8888888888",
  email: "ap@buyer.in",
};

const validInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  invoiceNumber: "INV/2026-27/00001",
  date: new Date("2026-04-05T00:00:00.000Z"),
  type: "INVOICE",
  supplyType: "INTERSTATE",
  reverseCharge: false,
  totalAmount: "11800",
  taxAmount: "1800",
  roundOff: "0",
  placeOfSupply: "KA",
  organization: validOrg,
  party: validBuyer,
  items: [
    {
      sequence: 1,
      description: "Laptop",
      hsnCode: "8471",
      quantity: "1",
      unitPrice: "10000",
      taxableAmount: "10000",
      discountAmount: "0",
      totalAmount: "11800",
      cgstRate: "0", cgstAmount: "0",
      sgstRate: "0", sgstAmount: "0",
      igstRate: "18", igstAmount: "1800",
      cessRate: null, cessAmount: null,
      item: {
        type: "GOODS",
        primaryUnit: { symbol: "NOS", name: "Nos" },
      },
    },
  ],
  ...overrides,
});

describe("buildEInvoicePayload — happy path", () => {
  it("builds a valid B2B interstate payload", async () => {
    const db = stubDb(validInvoice());
    const p = await buildEInvoicePayload(db, { invoiceId: "inv-1", organizationId: "org-1" });

    expect(p.Version).toBe("1.1");
    expect(p.TranDtls.TaxSch).toBe("GST");
    expect(p.TranDtls.SupTyp).toBe("B2B");
    expect(p.TranDtls.RegRev).toBe("N");
    expect(p.DocDtls.Typ).toBe("INV");
    expect(p.DocDtls.No).toBe("INV/2026-27/00001");
    expect(p.DocDtls.Dt).toBe("05/04/2026");

    expect(p.SellerDtls.Gstin).toBe("27AAAAA0000A1Z5");
    expect(p.SellerDtls.Stcd).toBe("27");
    expect(p.SellerDtls.Pin).toBe(400001);

    expect(p.BuyerDtls.Gstin).toBe("29AAAAA0000A1Z5");
    expect(p.BuyerDtls.Stcd).toBe("29");
    expect(p.BuyerDtls.Pos).toBe("29");

    expect(p.ItemList).toHaveLength(1);
    const it = p.ItemList[0];
    expect(it.HsnCd).toBe("8471");
    expect(it.IsServc).toBe("N");
    expect(it.IgstAmt).toBe(1800);
    expect(it.CgstAmt).toBe(0);
    expect(it.GstRt).toBe(18);

    expect(p.ValDtls.AssVal).toBe(10000);
    expect(p.ValDtls.IgstVal).toBe(1800);
    expect(p.ValDtls.CgstVal).toBe(0);
    expect(p.ValDtls.TotInvVal).toBe(11800);
  });

  it("builds intrastate B2B with CGST+SGST", async () => {
    const inv = validInvoice({
      supplyType: "INTRASTATE",
      placeOfSupply: "MH",
      party: { ...validBuyer, billingState: "MH", gstNo: "27AAAAA0000A1Z5" },
      items: [
        {
          sequence: 1,
          description: "Laptop",
          hsnCode: "8471",
          quantity: "1",
          unitPrice: "10000",
          taxableAmount: "10000",
          discountAmount: "0",
          totalAmount: "11800",
          cgstRate: "9", cgstAmount: "900",
          sgstRate: "9", sgstAmount: "900",
          igstRate: "0", igstAmount: "0",
          cessRate: null, cessAmount: null,
          item: { type: "GOODS", primaryUnit: { symbol: "NOS", name: "Nos" } },
        },
      ],
    });
    const db = stubDb(inv);
    const p = await buildEInvoicePayload(db, { invoiceId: "inv-1", organizationId: "org-1" });
    expect(p.ItemList[0].CgstAmt).toBe(900);
    expect(p.ItemList[0].SgstAmt).toBe(900);
    expect(p.ItemList[0].IgstAmt).toBe(0);
    expect(p.ItemList[0].GstRt).toBe(18);
    expect(p.BuyerDtls.Stcd).toBe("27");
    expect(p.BuyerDtls.Pos).toBe("27");
  });

  it("CREDIT_NOTE → DocDtls.Typ='CRN'", async () => {
    const inv = validInvoice({ type: "CREDIT_NOTE" });
    const p = await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
    expect(p.DocDtls.Typ).toBe("CRN");
  });

  it("EXPORT supply type with IGST → SupTyp='EXPWP'", async () => {
    const inv = validInvoice({
      supplyType: "EXPORT",
      party: { ...validBuyer, billingCountry: "US" },
    });
    const p = await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
    expect(p.TranDtls.SupTyp).toBe("EXPWP");
  });

  it("reverseCharge=true → TranDtls.RegRev='Y'", async () => {
    const inv = validInvoice({ reverseCharge: true });
    const p = await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
    expect(p.TranDtls.RegRev).toBe("Y");
  });

  it("service item → IsServc='Y'", async () => {
    const inv = validInvoice({
      items: [
        {
          ...validInvoice().items[0],
          item: { type: "SERVICE", primaryUnit: { symbol: "OTH", name: "Other" } },
        },
      ],
    });
    const p = await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
    expect(p.ItemList[0].IsServc).toBe("Y");
  });
});

describe("buildEInvoicePayload — validation errors", () => {
  it("throws on missing buyer GSTIN", async () => {
    const inv = validInvoice({ party: { ...validBuyer, gstNo: null } });
    await expect(
      buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" })
    ).rejects.toThrow(EInvoiceValidationError);
  });

  it("throws on invalid GSTIN format", async () => {
    const inv = validInvoice({ party: { ...validBuyer, gstNo: "BADGSTIN" } });
    try {
      await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EInvoiceValidationError;
      expect(err.details.some((d) => d.includes("GSTIN format invalid"))).toBe(true);
    }
  });

  it("throws on missing HSN code on a line", async () => {
    const inv = validInvoice({
      items: [{ ...validInvoice().items[0], hsnCode: null }],
    });
    try {
      await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EInvoiceValidationError;
      expect(err.details.some((d) => d.includes("HSN/SAC code is required"))).toBe(true);
    }
  });

  it("throws on missing organization address", async () => {
    const inv = validInvoice({
      organization: { ...validOrg, address: null },
    });
    try {
      await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EInvoiceValidationError;
      expect(err.details.some((d) => d.includes("Organization address"))).toBe(true);
    }
  });

  it("collects all errors at once for caller convenience", async () => {
    const inv = validInvoice({
      organization: { ...validOrg, gstNo: null, address: null },
      party: { ...validBuyer, gstNo: null, billingAddress: null },
    });
    try {
      await buildEInvoicePayload(stubDb(inv), { invoiceId: "inv-1", organizationId: "org-1" });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EInvoiceValidationError;
      expect(err.details.length).toBeGreaterThanOrEqual(4);
    }
  });
});
