import { describe, expect, it } from "vitest";
import { prisma } from "@/backend/database/client";
import {
  postExtractedDocument,
  PostExtractedError,
} from "@/backend/services/documents/post-extracted";
import type { ExtractedDocument } from "@/backend/services/ocr/schema";
import { createTestOrg } from "./factories";

/**
 * Confirming a scanned document.
 *
 * What matters here is fidelity to the paper: the posted record has to carry
 * the vendor's own numbers, including a tax split that disagrees with what our
 * master data would have derived, and a total that does not quite equal the
 * sum of its parts. Anything the importer "corrects" silently is a figure
 * nobody can reconcile against the original later.
 */

function bill(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    docType: "PURCHASE_BILL",
    direction: "INCOMING",
    partyName: "Sharma Trading Company",
    partyGstin: "27AABCS1429B1ZP",
    partyState: "Maharashtra",
    documentNumber: "STC/2026/0417",
    documentDate: "2026-04-03",
    dueDate: "2026-04-18",
    subtotal: 17000,
    cgstAmount: 1530,
    sgstAmount: 1530,
    totalAmount: 20060,
    lines: [
      { description: "Copper wire 2.5mm", quantity: 100, unitPrice: 145, amount: 14500, taxRate: 18, taxAmount: 2610 },
      { description: "PVC conduit 25mm", quantity: 40, unitPrice: 62.5, amount: 2500, taxRate: 18, taxAmount: 450 },
    ],
    ...overrides,
  } as ExtractedDocument;
}

describe("posting a confirmed document", () => {
  it("creates a draft bill with the vendor's own figures", async () => {
    const org = await createTestOrg();

    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-1",
      document: bill(),
    });

    expect(result.entityType).toBe("Bill");
    expect(result.partyCreated).toBe(true);

    const created = await prisma.bill.findUniqueOrThrow({
      where: { id: result.entityId },
      include: { items: { orderBy: { sequence: "asc" } }, party: true },
    });

    // A machine-read document does not skip approval: it lands as a draft
    // with no voucher behind it.
    expect(created.status).toBe("DRAFT");
    expect(created.voucherId).toBeNull();

    expect(created.vendorBillNo).toBe("STC/2026/0417");
    expect(Number(created.subtotal)).toBe(17000);
    expect(Number(created.taxAmount)).toBe(3060);
    expect(Number(created.totalAmount)).toBe(20060);
    expect(Number(created.amountDue)).toBe(20060);
    expect(created.items).toHaveLength(2);
    expect(created.items[0].description).toBe("Copper wire 2.5mm");
    expect(Number(created.items[0].taxableAmount)).toBe(14500);
  });

  it("creates the party from the document when it is a new supplier", async () => {
    const org = await createTestOrg();

    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-2",
      document: bill(),
    });

    const party = await prisma.party.findUniqueOrThrow({ where: { id: result.partyId } });
    expect(party.name).toBe("Sharma Trading Company");
    expect(party.type).toBe("VENDOR");
    expect(party.gstNo).toBe("27AABCS1429B1ZP");
    // PAN is embedded in the GSTIN — characters 3 to 12.
    expect(party.panNo).toBe("AABCS1429B");
    expect(party.billingState).toBe("Maharashtra");
  });

  it("reuses a supplier already on file, matched by GSTIN", async () => {
    const org = await createTestOrg();
    const existing = await prisma.party.create({
      data: {
        organizationId: org.orgId,
        type: "VENDOR",
        name: "Sharma Trading Co (old spelling)",
        gstNo: "27AABCS1429B1ZP",
        billingState: "Maharashtra",
      },
    });

    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-3",
      document: bill(),
    });

    expect(result.partyId).toBe(existing.id);
    expect(result.partyCreated).toBe(false);
    expect(await prisma.party.count({ where: { organizationId: org.orgId, gstNo: "27AABCS1429B1ZP" } })).toBe(1);
  });

  it("carries the vendor's round-off instead of arguing with the total", async () => {
    const org = await createTestOrg();

    // Lines and taxes come to 20,060; the vendor rounded the bill to 20,061.
    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-4",
      document: bill({ totalAmount: 20061 }),
    });

    const created = await prisma.bill.findUniqueOrThrow({ where: { id: result.entityId } });
    expect(Number(created.totalAmount)).toBe(20061);
    expect(Number(created.roundOff)).toBe(1);
  });

  it("keeps the tax split the document shows, not the one our states imply", async () => {
    const org = await createTestOrg();

    // Same-state parties would normally imply CGST+SGST; this vendor charged
    // IGST, and the bill on file is the legal document.
    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-5",
      document: bill({ cgstAmount: 0, sgstAmount: 0, igstAmount: 3060 }),
    });

    const created = await prisma.bill.findUniqueOrThrow({
      where: { id: result.entityId },
      include: { items: true },
    });
    expect(created.supplyType).toBe("INTERSTATE");
    expect(Number(created.items[0].igstAmount)).toBe(2610);
    expect(Number(created.items[0].cgstAmount)).toBe(0);
  });

  it("posts a sales document as an invoice instead", async () => {
    const org = await createTestOrg();

    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-6",
      document: bill({ docType: "SALES_INVOICE", direction: "OUTGOING", partyName: "Retail Customer" }),
    });

    expect(result.entityType).toBe("Invoice");
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.entityId },
      include: { party: true },
    });
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.party.type).toBe("CUSTOMER");
    expect(invoice.invoiceNumber).toMatch(/^INV\/2026-27\/\d{5}$/);
  });

  it("falls back to a single line when the table could not be read", async () => {
    const org = await createTestOrg();

    const result = await postExtractedDocument({
      orgId: org.orgId,
      userId: org.userId,
      extractionId: "ext-test-7",
      document: bill({ lines: [], subtotal: 17000, totalAmount: 20060 }),
    });

    const created = await prisma.bill.findUniqueOrThrow({
      where: { id: result.entityId },
      include: { items: true },
    });
    expect(created.items).toHaveLength(1);
    expect(Number(created.items[0].taxableAmount)).toBe(17000);
    expect(Number(created.totalAmount)).toBe(20060);
  });

  it("refuses a document nobody has classified", async () => {
    const org = await createTestOrg();

    await expect(
      postExtractedDocument({
        orgId: org.orgId,
        userId: org.userId,
        extractionId: "ext-test-8",
        document: bill({ docType: "UNKNOWN", direction: null }),
      })
    ).rejects.toThrow(PostExtractedError);
  });

  it("refuses a document with no party on it", async () => {
    const org = await createTestOrg();

    await expect(
      postExtractedDocument({
        orgId: org.orgId,
        userId: org.userId,
        extractionId: "ext-test-9",
        document: bill({ partyName: null, partyGstin: null }),
      })
    ).rejects.toThrow(PostExtractedError);
  });

  it("refuses a party belonging to another organization", async () => {
    const [mine, theirs] = await Promise.all([createTestOrg(), createTestOrg()]);

    await expect(
      postExtractedDocument({
        orgId: mine.orgId,
        userId: mine.userId,
        extractionId: "ext-test-10",
        document: bill(),
        partyId: theirs.vendorId,
      })
    ).rejects.toThrow(PostExtractedError);
  });
});
