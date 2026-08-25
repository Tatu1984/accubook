import { describe, expect, it } from "vitest";
import { parseIndianDate, readInvoiceText, stateFromGstin } from "../heuristics";

/**
 * The free reading path. Its value is entirely in the fields it gets right on
 * an ordinary printed GST invoice, so that is what these pin down — plus the
 * two mistakes that would matter most: reading a day-first date as month-first,
 * and mistaking our own GSTIN for the vendor's.
 */

const INVOICE = `SHARMA TRADING COMPANY
14/2 Nariman Point, Mumbai 400021
GSTIN: 27AABCS1429B1ZP
PAN: AABCS1429B
accounts@sharmatrading.example   9876543210

TAX INVOICE

Invoice No.: STC/2026/0417        Invoice Date: 03/04/2026
Due Date: 18/04/2026              P.O. No.: PO-8891

Bill To:
Accubook Demo Private Limited
GSTIN: 27AAACD1234E1Z5
Place of Supply: Maharashtra

Sr  Description            HSN     Qty   Rate      Amount
1   Copper wire 2.5mm      8544    100   145.00    14,500.00
2   PVC conduit 25mm       3917    40    62.50     2,500.00

Taxable Value: 17,000.00
CGST 9%: 1,530.00
SGST 9%: 1,530.00
Rounded off: 0.00
Grand Total: 20,060.00
`;

describe("reading a printed invoice without a model", () => {
  const reading = readInvoiceText(INVOICE, {
    ownGstin: "27AAACD1234E1Z5",
    ownName: "Accubook Demo Private Limited",
  });

  it("takes the counterparty's GSTIN, not ours", () => {
    expect(reading.document.partyGstin).toBe("27AABCS1429B1ZP");
    expect(reading.document.partyState).toBe("Maharashtra");
  });

  it("reads the invoice number and the day-first date", () => {
    expect(reading.document.documentNumber).toBe("STC/2026/0417");
    expect(reading.document.documentDate).toBe("2026-04-03");
    expect(reading.document.dueDate).toBe("2026-04-18");
    expect(reading.document.poNumber).toBe("PO-8891");
  });

  it("reads the money, including Indian digit grouping", () => {
    expect(reading.document.totalAmount).toBe(20060);
    expect(reading.document.subtotal).toBe(17000);
    expect(reading.document.cgstAmount).toBe(1530);
  });

  it("works out that the goods came to us", () => {
    expect(reading.document.direction).toBe("INCOMING");
    expect(reading.document.docType).toBe("PURCHASE_BILL");
  });

  it("takes the supplier's name from the top of the page", () => {
    expect(reading.document.partyName).toBe("SHARMA TRADING COMPANY");
  });

  it("reports how sure it is, field by field", () => {
    expect(reading.confidence.partyGstin).toBeGreaterThan(0.9);
    // The name is a guess at a line position, and says so.
    expect(reading.confidence.partyName).toBeLessThan(0.6);
    expect(reading.confidence.overall).toBeGreaterThan(0);
  });

  it("returns an empty reading rather than inventing one", () => {
    const blank = readInvoiceText("scanned image, no text layer");
    expect(blank.document.documentNumber).toBeNull();
    expect(blank.document.totalAmount).toBeNull();
    expect(blank.document.lines).toEqual([]);
  });
});

describe("reading a non-GST bill with a labelled header block", () => {
  // A metadata block — "Invoice No: …", "Bill Date: …" — sitting above or
  // beside the title in the original layout survives OCR in that order, and
  // used to get picked as the party name because it was simply the first
  // substantial line on the page.
  const MEDICAL_BILL = `Invoice No: 12345
Bill Date: 12 Dec 2021
Discharge Date: 12 Dec 2021
Contact: 9876543210

Apollo Hospital
Apollo Hospital, 21 Greams Lane, Chennai

Patient Information
Patient Name: Suresh (Age: 25)
`;

  it("skips labelled fields and takes the actual title as the name", () => {
    const reading = readInvoiceText(MEDICAL_BILL);
    expect(reading.document.partyName).toBe("Apollo Hospital");
  });
});

describe("Indian date parsing", () => {
  it("reads day-first numeric dates", () => {
    expect(parseIndianDate("03/04/2026")).toBe("2026-04-03");
    expect(parseIndianDate("3-4-26")).toBe("2026-04-03");
  });

  it("reads worded dates", () => {
    expect(parseIndianDate("3 Apr 2026")).toBe("2026-04-03");
    expect(parseIndianDate("15 December, 2025")).toBe("2025-12-15");
  });

  it("passes ISO through", () => {
    expect(parseIndianDate("2026-04-03")).toBe("2026-04-03");
  });

  it("gives up rather than guessing", () => {
    expect(parseIndianDate("sometime last week")).toBeNull();
    expect(parseIndianDate(null)).toBeNull();
  });
});

describe("GSTIN state codes", () => {
  it("maps the leading two digits to a state", () => {
    expect(stateFromGstin("27AABCS1429B1ZP")).toBe("Maharashtra");
    expect(stateFromGstin("29AABCS1429B1ZP")).toBe("Karnataka");
    expect(stateFromGstin("99AABCS1429B1ZP")).toBeNull();
    expect(stateFromGstin(null)).toBeNull();
  });
});
