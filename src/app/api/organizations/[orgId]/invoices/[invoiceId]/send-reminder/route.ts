import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations/[orgId]/invoices/[invoiceId]/send-reminder
 *
 * Records that a payment reminder was sent for an invoice. Creates an in-app
 * notification for the requesting user (so it surfaces in the bell menu) and
 * an audit log entry. Actual email/SMS dispatch is not wired yet — that's a
 * channel adapter (SES/Twilio) we'll add when notification preferences ship.
 * For now this gives the UI a non-dead button and a paper trail.
 */
export const POST = withOrgAuth<{ invoiceId: string }>(
  async (_req, { orgId, userId, params }) => {
    try {
      const { invoiceId } = params;
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        include: { party: { select: { id: true, name: true, email: true } } },
      });
      if (!invoice) return notFound("Invoice not found");
      if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
        return NextResponse.json(
          { error: `Cannot send reminder for ${invoice.status.toLowerCase()} invoice` },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.notification.create({
          data: {
            organizationId: orgId,
            userId,
            type: "PAYMENT_DUE",
            title: `Reminder logged for ${invoice.invoiceNumber}`,
            message: invoice.party.email
              ? `Reminder for ${invoice.party.name} (${invoice.party.email}). Email dispatch will fire when channels are configured.`
              : `Reminder logged for ${invoice.party.name}. No email on file — add one in the party record.`,
            data: { invoiceId, partyId: invoice.party.id },
          },
        });
        await writeAudit(tx, {
          organizationId: orgId,
          userId,
          action: "UPDATE",
          entityType: "Invoice",
          entityId: invoiceId,
          newData: {
            event: "REMINDER_SENT",
            partyEmail: invoice.party.email ?? null,
            invoiceNumber: invoice.invoiceNumber,
          },
        });
      });

      return NextResponse.json({
        ok: true,
        partyEmail: invoice.party.email,
      });
    } catch (error) {
      logger.error({ err: error }, "Error sending invoice reminder");
      return NextResponse.json(
        { error: "Failed to send reminder" },
        { status: 500 }
      );
    }
  }
);
