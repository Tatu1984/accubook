import { describe, expect, it } from "vitest";
import { parseTallyXml } from "../tally";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>All Masters</ID>
  </HEADER>
  <BODY>
    <DATA>
      <TALLYMESSAGE>
        <GROUP NAME="Sundry Debtors" RESERVEDNAME="Sundry Debtors">
          <PARENT>Current Assets</PARENT>
          <NATURE>ASSETS</NATURE>
        </GROUP>
        <GROUP NAME="Current Assets" RESERVEDNAME="Current Assets">
          <NATURE>ASSETS</NATURE>
        </GROUP>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <LEDGER NAME="Acme Customer" RESERVEDNAME="">
          <PARENT>Sundry Debtors</PARENT>
          <OPENINGBALANCE>-15000.00</OPENINGBALANCE>
          <PARTYGSTIN>27AAAAA0000A1Z5</PARTYGSTIN>
          <STATENAME>Maharashtra</STATENAME>
          <COUNTRYNAME>India</COUNTRYNAME>
          <PINCODE>400001</PINCODE>
          <EMAIL>ap@acme.in</EMAIL>
          <BILLCREDITPERIOD>30</BILLCREDITPERIOD>
        </LEDGER>
        <LEDGER NAME="Office Rent" RESERVEDNAME="">
          <PARENT>Indirect Expenses</PARENT>
          <OPENINGBALANCE>0</OPENINGBALANCE>
        </LEDGER>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <STOCKITEM NAME="Laptop">
          <PARENT>Computers</PARENT>
          <BASEUNITS>NOS</BASEUNITS>
          <HSNCODE>8471</HSNCODE>
          <COSTINGMETHOD>FIFO</COSTINGMETHOD>
        </STOCKITEM>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;

describe("parseTallyXml", () => {
  it("extracts groups across multiple TALLYMESSAGE blocks", () => {
    const parsed = parseTallyXml(SAMPLE_XML);
    expect(parsed.groups).toHaveLength(2);
    const names = parsed.groups.map((g) => g["@_NAME"]).sort();
    expect(names).toEqual(["Current Assets", "Sundry Debtors"]);
  });

  it("captures group PARENT and NATURE", () => {
    const parsed = parseTallyXml(SAMPLE_XML);
    const debtors = parsed.groups.find((g) => g["@_NAME"] === "Sundry Debtors")!;
    expect(debtors.PARENT).toBe("Current Assets");
    expect(debtors.NATURE).toBe("ASSETS");
  });

  it("extracts ledgers with party fields", () => {
    const parsed = parseTallyXml(SAMPLE_XML);
    expect(parsed.ledgers).toHaveLength(2);
    const acme = parsed.ledgers.find((l) => l["@_NAME"] === "Acme Customer")!;
    expect(acme.PARENT).toBe("Sundry Debtors");
    expect(acme.PARTYGSTIN).toBe("27AAAAA0000A1Z5");
    expect(acme.STATENAME).toBe("Maharashtra");
    expect(acme.COUNTRYNAME).toBe("India");
    expect(acme.PINCODE).toBe("400001");
    expect(acme.OPENINGBALANCE).toBe("-15000.00");
  });

  it("extracts stock items with HSN and base unit", () => {
    const parsed = parseTallyXml(SAMPLE_XML);
    expect(parsed.stockItems).toHaveLength(1);
    const laptop = parsed.stockItems[0];
    expect(laptop["@_NAME"]).toBe("Laptop");
    expect(laptop.HSNCODE).toBe("8471");
    expect(laptop.BASEUNITS).toBe("NOS");
    expect(laptop.COSTINGMETHOD).toBe("FIFO");
  });

  it("handles a single GROUP element (not wrapped in array)", () => {
    const single = `<?xml version="1.0"?>
<ENVELOPE><BODY><DATA><TALLYMESSAGE>
  <GROUP NAME="Solo Group"><NATURE>EXPENSES</NATURE></GROUP>
</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const parsed = parseTallyXml(single);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]["@_NAME"]).toBe("Solo Group");
  });

  it("returns empty arrays for an unrecognized envelope", () => {
    const stub = `<?xml version="1.0"?><ENVELOPE><HEADER/></ENVELOPE>`;
    const parsed = parseTallyXml(stub);
    expect(parsed.groups).toEqual([]);
    expect(parsed.ledgers).toEqual([]);
    expect(parsed.stockItems).toEqual([]);
  });

  it("flattens multiple TALLYMESSAGE elements at sibling level", () => {
    const multiMsg = `<?xml version="1.0"?>
<ENVELOPE><BODY><DATA>
  <TALLYMESSAGE><GROUP NAME="A"/></TALLYMESSAGE>
  <TALLYMESSAGE><GROUP NAME="B"/></TALLYMESSAGE>
  <TALLYMESSAGE><GROUP NAME="C"/></TALLYMESSAGE>
</DATA></BODY></ENVELOPE>`;
    const parsed = parseTallyXml(multiMsg);
    expect(parsed.groups.map((g) => g["@_NAME"]).sort()).toEqual(["A", "B", "C"]);
  });
});
