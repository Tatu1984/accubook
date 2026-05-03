import { describe, expect, it } from "vitest";
import { gstr1ToPortalJson } from "../gstr1-portal";
import type { Gstr1Result } from "../gstr1";

const opts = {
  gstin: "27AAAAA0000A1Z5",
  periodStart: new Date("2026-04-01T00:00:00.000Z"),
};

const emptyResult = (): Gstr1Result => ({
  period: { from: "2026-04-01", to: "2026-04-30" },
  b2b: [],
  b2cl: [],
  b2cs: [],
  cdnr: [],
  cdnur: [],
  exp: [],
  nil: [],
  hsn: [],
  docs: [],
});

describe("gstr1ToPortalJson — top level", () => {
  it("formats fp as MMYYYY from periodStart", () => {
    const out = gstr1ToPortalJson(emptyResult(), opts);
    expect(out.fp).toBe("042026");
    expect(out.gstin).toBe("27AAAAA0000A1Z5");
  });

  it("uses 0 as the default for gt and cur_gt when caller doesn't pass them", () => {
    const out = gstr1ToPortalJson(emptyResult(), opts);
    expect(out.gt).toBe(0);
    expect(out.cur_gt).toBe(0);
  });
});

describe("gstr1ToPortalJson — B2B section", () => {
  it("converts an intrastate B2B invoice to portal shape", () => {
    const r = emptyResult();
    r.b2b = [
      {
        ctin: "27AAAAA0000A1Z5",
        partyName: "Acme",
        invoices: [
          {
            invoiceNumber: "INV/2026-27/00001",
            date: "2026-04-05",
            totalValue: "1180",
            placeOfSupply: "MH",
            reverseCharge: false,
            invoiceType: "INVOICE",
            items: [
              {
                rate: "18.00",
                taxableValue: "1000",
                cgst: "90",
                sgst: "90",
                igst: "0",
                cess: "0",
              },
            ],
          },
        ],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.b2b).toHaveLength(1);
    const inv = out.b2b[0].inv[0];
    expect(inv.idt).toBe("05-04-2026");           // DD-MM-YYYY
    expect(inv.pos).toBe("27");                   // numeric state code
    expect(inv.rchrg).toBe("N");
    expect(inv.inv_typ).toBe("R");
    expect(inv.val).toBe(1180);                   // number, not string
    expect(inv.itms[0].itm_det.rt).toBe(18);
    expect(inv.itms[0].itm_det.txval).toBe(1000);
    expect(inv.itms[0].itm_det.camt).toBe(90);
    expect(inv.itms[0].itm_det.samt).toBe(90);
    expect(inv.itms[0].itm_det.iamt).toBe(0);
  });

  it("reverseCharge true → rchrg 'Y'", () => {
    const r = emptyResult();
    r.b2b = [
      {
        ctin: "27AAAAA0000A1Z5",
        partyName: "Acme",
        invoices: [{
          invoiceNumber: "X", date: "2026-04-05", totalValue: "100",
          placeOfSupply: "MH", reverseCharge: true, invoiceType: "INVOICE",
          items: [{ rate: "18.00", taxableValue: "100", cgst: "9", sgst: "9", igst: "0", cess: "0" }],
        }],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.b2b[0].inv[0].rchrg).toBe("Y");
  });
});

describe("gstr1ToPortalJson — B2CL", () => {
  it("groups invoices by numeric place of supply", () => {
    const r = emptyResult();
    r.b2cl = [
      {
        invoiceNumber: "INV/2026-27/00010",
        date: "2026-04-05",
        totalValue: "354000",
        placeOfSupply: "KA",
        partyName: "Big Walk-in",
        items: [{ rate: "18.00", taxableValue: "300000", cgst: "0", sgst: "0", igst: "54000", cess: "0" }],
      },
      {
        invoiceNumber: "INV/2026-27/00011",
        date: "2026-04-06",
        totalValue: "300000",
        placeOfSupply: "KA",
        partyName: "Another Big",
        items: [{ rate: "18.00", taxableValue: "254237.29", cgst: "0", sgst: "0", igst: "45762.71", cess: "0" }],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.b2cl).toHaveLength(1);
    expect(out.b2cl[0].pos).toBe("29");
    expect(out.b2cl[0].inv).toHaveLength(2);
  });
});

describe("gstr1ToPortalJson — B2CS", () => {
  it("sets sply_ty=INTER when igst > 0, INTRA otherwise", () => {
    const r = emptyResult();
    r.b2cs = [
      { placeOfSupply: "MH", rate: "18.00", type: "OE", taxableValue: "1000", cgst: "90", sgst: "90", igst: "0", cess: "0" },
      { placeOfSupply: "KA", rate: "18.00", type: "OE", taxableValue: "1000", cgst: "0", sgst: "0", igst: "180", cess: "0" },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.b2cs[0].sply_ty).toBe("INTRA");
    expect(out.b2cs[1].sply_ty).toBe("INTER");
  });
});

describe("gstr1ToPortalJson — CDNR / CDNUR", () => {
  it("groups CDNR by counterparty CTIN, ntty preserves C/D", () => {
    const r = emptyResult();
    r.cdnr = [
      {
        ctin: "29AAAAA0000A1Z5",
        partyName: "Acme",
        noteNumber: "CN/2026-27/00001",
        noteDate: "2026-04-10",
        noteType: "C",
        totalValue: "118",
        placeOfSupply: "KA",
        reverseCharge: false,
        items: [{ rate: "18.00", taxableValue: "100", cgst: "0", sgst: "0", igst: "18", cess: "0" }],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.cdnr).toHaveLength(1);
    expect(out.cdnr[0].ctin).toBe("29AAAAA0000A1Z5");
    expect(out.cdnr[0].nt[0].ntty).toBe("C");
    expect(out.cdnr[0].nt[0].nt_dt).toBe("10-04-2026");
  });

  it("CDNUR carries typ=B2CL by default", () => {
    const r = emptyResult();
    r.cdnur = [
      {
        partyName: "Walk-in",
        noteNumber: "CN/2026-27/00002",
        noteDate: "2026-04-12",
        noteType: "D",
        totalValue: "236",
        placeOfSupply: "KA",
        items: [{ rate: "18.00", taxableValue: "200", cgst: "0", sgst: "0", igst: "36", cess: "0" }],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.cdnur).toHaveLength(1);
    expect(out.cdnur[0].typ).toBe("B2CL");
    expect(out.cdnur[0].ntty).toBe("D");
  });
});

describe("gstr1ToPortalJson — EXP", () => {
  it("splits exports into WPAY and WOPAY groups", () => {
    const r = emptyResult();
    r.exp = [
      {
        invoiceNumber: "EXP/2026-27/00001",
        date: "2026-04-20",
        totalValue: "118000",
        partyName: "Foreign Co",
        exportType: "WPAY",
        items: [{ rate: "18.00", taxableValue: "100000", cgst: "0", sgst: "0", igst: "18000", cess: "0" }],
      },
      {
        invoiceNumber: "EXP/2026-27/00002",
        date: "2026-04-21",
        totalValue: "100000",
        partyName: "Foreign Co",
        exportType: "WOPAY",
        items: [{ rate: "0.00", taxableValue: "100000", cgst: "0", sgst: "0", igst: "0", cess: "0" }],
      },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.exp).toHaveLength(2);
    const wpay = out.exp.find((g) => g.exp_typ === "WPAY")!;
    const wopay = out.exp.find((g) => g.exp_typ === "WOPAY")!;
    expect(wpay.inv).toHaveLength(1);
    expect(wopay.inv).toHaveLength(1);
    expect(wpay.inv[0].itms[0].iamt).toBe(18000);
    expect(wopay.inv[0].itms[0].iamt).toBe(0);
  });
});

describe("gstr1ToPortalJson — NIL bucket mapping", () => {
  it("maps internal bucket names to portal sply_ty values", () => {
    const r = emptyResult();
    r.nil = [
      { bucket: "INTRA_REG", amount: "100" },
      { bucket: "INTRA_UNREG", amount: "200" },
      { bucket: "INTER_REG", amount: "300" },
      { bucket: "INTER_UNREG", amount: "400" },
    ];
    const out = gstr1ToPortalJson(r, opts);
    const types = out.nil.inv.map((row) => row.sply_ty).sort();
    expect(types).toEqual(["INTERB2B", "INTERB2C", "INTRB2B", "INTRB2C"]);
    const unregInter = out.nil.inv.find((r) => r.sply_ty === "INTERB2C")!;
    expect(unregInter.nil_amt).toBe(400);
  });
});

describe("gstr1ToPortalJson — HSN section", () => {
  it("wraps HSN rows in { data: [...] } with sequential num", () => {
    const r = emptyResult();
    r.hsn = [
      { hsnCode: "8523", description: null, uqc: "NOS", quantity: "5", totalValue: "5900", taxableValue: "5000", rate: "18.00", cgst: "450", sgst: "450", igst: "0", cess: "0" },
      { hsnCode: "9988", description: "Service", uqc: "OTH", quantity: "1", totalValue: "1000", taxableValue: "1000", rate: "0.00", cgst: "0", sgst: "0", igst: "0", cess: "0" },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.hsn.data).toHaveLength(2);
    expect(out.hsn.data[0].num).toBe(1);
    expect(out.hsn.data[1].num).toBe(2);
    expect(out.hsn.data[0].hsn_sc).toBe("8523");
    expect(out.hsn.data[0].uqc).toBe("NOS");
    expect(out.hsn.data[0].qty).toBe(5);
  });
});

describe("gstr1ToPortalJson — DOCS section", () => {
  it("wraps each doc-type as its own doc_det entry", () => {
    const r = emptyResult();
    r.docs = [
      { docType: "Invoice", fromNum: "INV/2026-27/00001", toNum: "INV/2026-27/00010", total: 10, cancelled: 1, netIssued: 9 },
      { docType: "Credit Note", fromNum: "CN/00001", toNum: "CN/00002", total: 2, cancelled: 0, netIssued: 2 },
    ];
    const out = gstr1ToPortalJson(r, opts);
    expect(out.doc_issue.doc_det).toHaveLength(2);
    expect(out.doc_issue.doc_det[0].doc_num).toBe(1);
    expect(out.doc_issue.doc_det[0].doc_typ).toBe("Invoice");
    expect(out.doc_issue.doc_det[0].docs[0].totnum).toBe(10);
    expect(out.doc_issue.doc_det[0].docs[0].cancel).toBe(1);
    expect(out.doc_issue.doc_det[0].docs[0].net_issue).toBe(9);
  });
});
