import { describe, expect, it } from "vitest";
import { parseStatementCsv } from "../statement-import";

describe("parseStatementCsv — HDFC format", () => {
  // HDFC's actual export: lots of summary rows above the table, then the data.
  const HDFC = `Statement for HDFC Bank Ltd.
A/c No: 50100123456789
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
05/04/26,UPI-CUSTOMER PAYMENT,UPI/123456,05/04/26,0.00,5000.00,15000.00
06/04/26,NEFT-VENDOR,NEFT/REF/789,06/04/26,2500.00,0.00,12500.00
`;

  it("parses HDFC two-row sample, including DD/MM/YY date format", () => {
    const { txns, warnings } = parseStatementCsv(HDFC, "HDFC");
    expect(txns).toHaveLength(2);
    expect(warnings).toEqual([]);
    expect(txns[0].date.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(txns[0].description).toBe("UPI-CUSTOMER PAYMENT");
    expect(txns[0].creditAmount.toString()).toBe("5000");
    expect(txns[0].debitAmount.toString()).toBe("0");
    expect(txns[1].debitAmount.toString()).toBe("2500");
  });

  it("strips Indian thousand separators (e.g. 1,23,456.78)", () => {
    const HDFC_LARGE = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
05/04/26,Large credit,REF1,05/04/26,0.00,"1,23,456.78","1,23,456.78"
`;
    const { txns } = parseStatementCsv(HDFC_LARGE, "HDFC");
    expect(txns[0].creditAmount.toString()).toBe("123456.78");
  });
});

describe("parseStatementCsv — ICICI format", () => {
  const ICICI = `S.No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR),Deposit Amount (INR),Balance (INR)
1,05/04/2026,05/04/2026,,UPI/CR/CUSTOMER,0.00,5000.00,15000.00
2,06/04/2026,06/04/2026,,NEFT-VENDOR PMT,2500.00,0.00,12500.00
`;

  it("parses ICICI sample with DD/MM/YYYY", () => {
    const { txns } = parseStatementCsv(ICICI, "ICICI");
    expect(txns).toHaveLength(2);
    expect(txns[0].date.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(txns[0].creditAmount.toString()).toBe("5000");
  });
});

describe("parseStatementCsv — SBI format", () => {
  const SBI = `Account Number: 123456789
Statement Period: 01 Apr 2026 to 30 Apr 2026

Txn Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
05 Apr 2026,UPI-CUSTOMER PAYMENT,UPI/123456,,5000.00,15000.00
06 Apr 2026,NEFT-VENDOR,NEFT/789,2500.00,,12500.00
`;

  it("parses SBI sample with 'DD MMM YYYY' date", () => {
    const { txns } = parseStatementCsv(SBI, "SBI");
    expect(txns).toHaveLength(2);
    expect(txns[0].date.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(txns[0].creditAmount.toString()).toBe("5000");
    expect(txns[1].debitAmount.toString()).toBe("2500");
  });
});

describe("parseStatementCsv — Axis format", () => {
  const AXIS = `Tran Date,CHQNO,Particulars,Debit,Credit,Balance,Init.Br
05-04-2026,,UPI/CR/CUSTOMER,0.00,5000.00,15000.00,MUMBAI
06-04-2026,,NEFT VENDOR PMT,2500.00,0.00,12500.00,MUMBAI
`;

  it("parses Axis sample with DD-MM-YYYY", () => {
    const { txns } = parseStatementCsv(AXIS, "AXIS");
    expect(txns).toHaveLength(2);
    expect(txns[0].date.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(txns[0].creditAmount.toString()).toBe("5000");
  });
});

describe("parseStatementCsv — generic fallback", () => {
  it("works with column headers in lowercase / variant naming", () => {
    const generic = `date,description,debit,credit,balance
2026-04-05,UPI received,0,5000,15000
2026-04-06,NEFT sent,2500,0,12500
`;
    const { txns } = parseStatementCsv(generic, "GENERIC");
    expect(txns).toHaveLength(2);
    expect(txns[0].creditAmount.toString()).toBe("5000");
    expect(txns[1].debitAmount.toString()).toBe("2500");
  });
});

describe("parseStatementCsv — error handling", () => {
  it("returns empty + warning when no header row matches", () => {
    const garbage = `something,unrelated,here\n1,2,3\n`;
    const { txns, warnings } = parseStatementCsv(garbage, "HDFC");
    expect(txns).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("warns on unparseable date but still returns other rows", () => {
    const partial = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
NOT_A_DATE,Garbage row,,,,5000.00,15000.00
05/04/26,Real row,UPI,05/04/26,0.00,5000.00,15000.00
`;
    const { txns, warnings } = parseStatementCsv(partial, "HDFC");
    expect(txns).toHaveLength(1);
    expect(warnings.some((w) => w.includes("unparseable date"))).toBe(true);
  });

  it("handles BOM-prefixed files", () => {
    const HDFC_BOM = "﻿" + `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
05/04/26,Test,REF,05/04/26,0,1000,1000
`;
    const { txns } = parseStatementCsv(HDFC_BOM, "HDFC");
    expect(txns).toHaveLength(1);
  });
});
