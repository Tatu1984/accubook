import { describe, expect, it } from "vitest";
import { buildEwayBillPayload, EwayBillValidationError } from "../eway-bill";

function stubDb(invoice: unknown) {
  return {
    invoice: {
      findFirst: async () => invoice,
    },
  } as unknown as Parameters<typeof buildEwayBillPayload>[0];
}

const validOrg = {
  id: "org-1",
  name: "Acme Pvt Ltd",
  legalName: "Acme Private Limited",
  gstNo: "27AAACR4849P1ZP",
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
  gstNo: "29AAACR4849P1ZP",
  billingAddress: "456 Big St",
  billingCity: "Bangalore",
  billingState: "KA",
  billingPostal: "560001",
  billingCountry: "IN",
};

const validInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: "inv-1",
  invoiceNumber: "INV/2026-27/00001",
  date: new Date("2026-04-05T00:00:00.000Z"),
  type: "INVOICE",
  supplyType: "INTERSTATE",
  reverseCharge: false,
  totalAmount: "118000",
  taxAmount: "18000",
  organization: validOrg,
  party: validBuyer,
  items: [
    {
      sequence: 1,
      description: "Laptop",
      hsnCode: "8471",
      quantity: "1",
      unitPrice: "100000",
      taxableAmount: "100000",
      discountAmount: "0",
      totalAmount: "118000",
      cgstRate: "0", cgstAmount: "0",
      sgstRate: "0", sgstAmount: "0",
      igstRate: "18", igstAmount: "18000",
      cessRate: null, cessAmount: null,
      item: { name: "Laptop", primaryUnit: { symbol: "NOS", name: "Nos" } },
    },
  ],
  ...overrides,
});

describe("buildEwayBillPayload — happy path", () => {
  it("builds an interstate ₹1L invoice payload with vehicle", async () => {
    const db = stubDb(validInvoice());
    const p = await buildEwayBillPayload(db, {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: {
        transMode: "1",
        transDistance: 1000,
        vehicleNo: "MH12 AB 1234",
        vehicleType: "R",
      },
    });

    expect(p.supplyType).toBe("O");
    expect(p.subSupplyType).toBe(1);
    expect(p.docType).toBe("INV");
    expect(p.docDate).toBe("05/04/2026");
    expect(p.fromGstin).toBe("27AAACR4849P1ZP");
    expect(p.fromStateCode).toBe(27);
    expect(p.toStateCode).toBe(29);
    expect(p.totalValue).toBe(100000);
    expect(p.igstValue).toBe(18000);
    expect(p.transMode).toBe("1");
    expect(p.transDistance).toBe("1000");
    expect(p.vehicleNo).toBe("MH12AB1234"); // spaces stripped, uppercased
    expect(p.itemList).toHaveLength(1);
    expect(p.itemList[0].hsnCode).toBe(8471);
    expect(p.itemList[0].quantity).toBe(1);
    expect(p.itemList[0].qtyUnit).toBe("NOS");
  });

  it("export → subSupplyType=3 by default", async () => {
    const inv = validInvoice({ supplyType: "EXPORT" });
    const db = stubDb(inv);
    const p = await buildEwayBillPayload(db, {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: { transDistance: 50, transporterId: "T123456789012345" },
    });
    expect(p.subSupplyType).toBe(3);
  });

  it("CREDIT_NOTE → docType='OTH'", async () => {
    const inv = validInvoice({ type: "CREDIT_NOTE" });
    const p = await buildEwayBillPayload(stubDb(inv), {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: { transDistance: 1, transporterId: "T123" },
    });
    expect(p.docType).toBe("OTH");
  });

  it("unregistered buyer → toGstin='URP'", async () => {
    const inv = validInvoice({
      party: { ...validBuyer, gstNo: null },
    });
    const p = await buildEwayBillPayload(stubDb(inv), {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: { transDistance: 50, transporterId: "T123" },
    });
    expect(p.toGstin).toBe("URP");
  });

  it("transporterId without vehicle is acceptable for road transport", async () => {
    const db = stubDb(validInvoice());
    const p = await buildEwayBillPayload(db, {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: { transDistance: 1000, transporterId: "T123456789012345" },
    });
    expect(p.transporterId).toBe("T123456789012345");
    expect(p.vehicleNo).toBeUndefined();
  });
});

describe("buildEwayBillPayload — threshold", () => {
  it("rejects when total taxable < ₹50,000", async () => {
    const inv = validInvoice({
      totalAmount: "47200",
      taxAmount: "7200",
      items: [
        {
          ...validInvoice().items[0],
          taxableAmount: "40000",
          totalAmount: "47200",
          igstAmount: "7200",
        },
      ],
    });
    try {
      await buildEwayBillPayload(stubDb(inv), {
        invoiceId: "inv-1",
        organizationId: "org-1",
        transport: { transDistance: 100, vehicleNo: "MH12AB1234" },
      });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EwayBillValidationError;
      expect(err.details.some((d) => d.includes("below the ₹50,000 e-way bill threshold"))).toBe(true);
    }
  });

  it("accepts at exactly ₹50,000", async () => {
    const inv = validInvoice({
      totalAmount: "59000",
      items: [
        {
          ...validInvoice().items[0],
          taxableAmount: "50000",
          totalAmount: "59000",
          igstAmount: "9000",
        },
      ],
    });
    const p = await buildEwayBillPayload(stubDb(inv), {
      invoiceId: "inv-1",
      organizationId: "org-1",
      transport: { transDistance: 100, vehicleNo: "MH12AB1234" },
    });
    expect(p.totalValue).toBe(50000);
  });
});

describe("buildEwayBillPayload — validation errors", () => {
  it("rejects road transport without vehicle or transporter", async () => {
    try {
      await buildEwayBillPayload(stubDb(validInvoice()), {
        invoiceId: "inv-1",
        organizationId: "org-1",
        transport: { transMode: "1", transDistance: 100 },
      });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EwayBillValidationError;
      expect(err.details.some((d) => d.toLowerCase().includes("vehicle"))).toBe(true);
    }
  });

  it("rejects out-of-range distance", async () => {
    try {
      await buildEwayBillPayload(stubDb(validInvoice()), {
        invoiceId: "inv-1",
        organizationId: "org-1",
        transport: { transDistance: 5000, vehicleNo: "MH12AB1234" },
      });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EwayBillValidationError;
      expect(err.details.some((d) => d.includes("0–4000"))).toBe(true);
    }
  });

  it("rejects missing seller GSTIN with structured detail", async () => {
    const inv = validInvoice({ organization: { ...validOrg, gstNo: null } });
    try {
      await buildEwayBillPayload(stubDb(inv), {
        invoiceId: "inv-1",
        organizationId: "org-1",
        transport: { transDistance: 100, vehicleNo: "MH12AB1234" },
      });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EwayBillValidationError;
      expect(err.details.some((d) => d.includes("Seller GSTIN"))).toBe(true);
    }
  });

  it("collects all errors at once", async () => {
    const inv = validInvoice({
      organization: { ...validOrg, gstNo: null, address: null },
      party: { ...validBuyer, billingAddress: null },
      items: [{ ...validInvoice().items[0], hsnCode: null }],
    });
    try {
      await buildEwayBillPayload(stubDb(inv), {
        invoiceId: "inv-1",
        organizationId: "org-1",
        transport: { transDistance: 100, vehicleNo: "MH12AB1234" },
      });
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as EwayBillValidationError;
      expect(err.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});
