import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";
import { sendEmail } from "@/backend/services/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/documents/send
 *
 * One endpoint behind every "Send to Customer" / "Send to Vendor" action.
 * Each list screen only knows a document type and an id, so rather than a
 * bespoke route per resource this resolves the record, emails the counterparty
 * a summary through the configured provider, and leaves an audit trail.
 *
 * When no email provider is configured `sendEmail` is a logged no-op; the
 * response says so explicitly rather than claiming the mail went out.
 */

const sendDocumentSchema = z.object({
  type: z.enum([
    "invoice",
    "creditNote",
    "bill",
    "debitNote",
    "quotation",
    "salesOrder",
    "purchaseOrder",
    "receipt",
  ]),
  id: z.string().min(1, "Document id is required"),
  /** Overrides the party email on file. */
  to: optional(z.string().email()),
  message: optional(z.string().max(2000)),
});

type ResolvedDocument = {
  entityType: string;
  label: string;
  number: string;
  date: Date;
  total: unknown;
  partyName: string;
  partyEmail: string | null;
  currency: string;
};

function formatAmount(value: unknown, currency: string): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

export const POST = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const { type, id, to, message } = sendDocumentSchema.parse(body);

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, email: true },
    });

    const partySelect = { select: { id: true, name: true, email: true } };
    let doc: ResolvedDocument | null = null;

    if (type === "invoice" || type === "creditNote") {
      const invoice = await prisma.invoice.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (invoice) {
        doc = {
          entityType: "Invoice",
          label: type === "creditNote" ? "Credit Note" : "Invoice",
          number: invoice.invoiceNumber,
          date: invoice.date,
          total: invoice.totalAmount,
          partyName: invoice.party.name,
          partyEmail: invoice.party.email,
          currency: "INR",
        };
      }
    } else if (type === "bill" || type === "debitNote") {
      const bill = await prisma.bill.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (bill) {
        doc = {
          entityType: "Bill",
          label: type === "debitNote" ? "Debit Note" : "Bill",
          number: bill.billNumber,
          date: bill.date,
          total: bill.totalAmount,
          partyName: bill.party.name,
          partyEmail: bill.party.email,
          currency: "INR",
        };
      }
    } else if (type === "quotation") {
      const quotation = await prisma.quotation.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (quotation) {
        doc = {
          entityType: "Quotation",
          label: "Quotation",
          number: quotation.quotationNumber,
          date: quotation.date,
          total: quotation.totalAmount,
          partyName: quotation.party.name,
          partyEmail: quotation.party.email,
          currency: "INR",
        };
      }
    } else if (type === "salesOrder") {
      const order = await prisma.salesOrder.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (order) {
        doc = {
          entityType: "SalesOrder",
          label: "Sales Order",
          number: order.orderNumber,
          date: order.date,
          total: order.totalAmount,
          partyName: order.party.name,
          partyEmail: order.party.email,
          currency: "INR",
        };
      }
    } else if (type === "purchaseOrder") {
      const order = await prisma.purchaseOrder.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (order) {
        doc = {
          entityType: "PurchaseOrder",
          label: "Purchase Order",
          number: order.orderNumber,
          date: order.date,
          total: order.totalAmount,
          partyName: order.party.name,
          partyEmail: order.party.email,
          currency: "INR",
        };
      }
    } else if (type === "receipt") {
      const receipt = await prisma.receipt.findFirst({
        where: { id, organizationId: orgId },
        include: { party: partySelect },
      });
      if (receipt) {
        doc = {
          entityType: "Receipt",
          label: "Receipt",
          number: receipt.receiptNumber,
          date: receipt.date,
          total: receipt.amount,
          partyName: receipt.party.name,
          partyEmail: receipt.party.email,
          currency: "INR",
        };
      }
    }

    if (!doc) return notFound("Document not found");

    const recipient = to ?? doc.partyEmail;
    if (!recipient) {
      return badRequest(
        `${doc.partyName} has no email address on file — add one on the party record first`
      );
    }

    const issuer = organization?.name ?? "accubook";
    const amount = formatAmount(doc.total, doc.currency);
    const subject = `${doc.label} ${doc.number} from ${issuer}`;
    const text =
      `Dear ${doc.partyName},\n\n` +
      (message ? `${message}\n\n` : "") +
      `Please find the details of ${doc.label.toLowerCase()} ${doc.number} below.\n\n` +
      `Date: ${doc.date.toLocaleDateString("en-IN")}\n` +
      `Amount: ${amount}\n\n` +
      `Regards,\n${issuer}`;

    const result = await sendEmail({
      to: recipient,
      subject,
      text,
      replyTo: organization?.email ?? undefined,
      tags: [
        { name: "kind", value: "document-send" },
        { name: "documentType", value: type },
      ],
    });

    if (!result.ok) {
      logger.error({ err: result.error, type, id }, "Document email failed");
      return NextResponse.json(
        { error: `Failed to send: ${result.error}` },
        { status: 502 }
      );
    }

    const delivered = result.provider !== "noop";

    await prisma.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          organizationId: orgId,
          userId,
          type: "SYSTEM",
          title: `${doc.label} ${doc.number} sent to ${doc.partyName}`,
          message: delivered
            ? `Emailed to ${recipient}.`
            : `Not delivered — no email provider is configured (${
                "reason" in result ? result.reason : "unconfigured"
              }). Set RESEND_API_KEY and EMAIL_FROM to enable sending.`,
          data: { documentType: type, documentId: id, recipient },
        },
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "UPDATE",
        entityType: doc.entityType,
        entityId: id,
        newData: {
          event: "DOCUMENT_SENT",
          recipient,
          delivered,
          number: doc.number,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      delivered,
      recipient,
      reason: "reason" in result ? result.reason : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error sending document");
    return NextResponse.json(
      { error: "Failed to send document" },
      { status: 500 }
    );
  }
});
