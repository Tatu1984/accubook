import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payroll configuration for the HR module.
 *
 * The Payroll → Settings tab had unbound inputs and a Save button with no
 * endpoint behind it; nothing entered there survived a page refresh. These
 * values are stored on `Organization.payrollSettings`.
 *
 * The statutory rates themselves (PF 12%, ESI 0.75/3.25%, gratuity 4.81%) are
 * fixed by law and stay in the calculation code — what is configurable here is
 * the organization's registration numbers and which components apply.
 */

const payrollSettingsSchema = z.object({
  epfEstablishmentCode: z.string().max(50).default(""),
  /** "15000" = statutory ceiling, "actual" = contribute on actual basic. */
  epfWageCeiling: z.enum(["15000", "actual"]).default("15000"),
  includeEmployerPfInCtc: z.boolean().default(true),
  allowVpf: z.boolean().default(false),
  esiCode: z.string().max(50).default(""),
  tanNumber: z.string().max(20).default(""),
  defaultTaxRegime: z.enum(["new", "old"]).default("new"),
  financialYear: z.string().max(10).default("2025-26"),
  componentsEnabled: z
    .object({
      pf: z.boolean().default(true),
      esi: z.boolean().default(true),
      professionalTax: z.boolean().default(true),
      tds: z.boolean().default(true),
      lwf: z.boolean().default(false),
      gratuity: z.boolean().default(true),
    })
    .default({
      pf: true,
      esi: true,
      professionalTax: true,
      tds: true,
      lwf: false,
      gratuity: true,
    }),
});

export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

/** Defaults applied when an organization has never saved this sheet. */
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings =
  payrollSettingsSchema.parse({});

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { payrollSettings: true, tanNo: true },
    });

    const stored = payrollSettingsSchema.safeParse(org?.payrollSettings ?? {});
    const settings = stored.success ? stored.data : DEFAULT_PAYROLL_SETTINGS;

    // The organization's TAN is already captured on the org record; use it as
    // the starting value so the two do not silently disagree.
    if (!settings.tanNumber && org?.tanNo) {
      settings.tanNumber = org.tanNo;
    }

    return NextResponse.json({ data: settings });
  } catch (error) {
    logger.error({ err: error }, "Error fetching payroll settings");
    return NextResponse.json(
      { error: "Failed to fetch payroll settings" },
      { status: 500 }
    );
  }
});

export const PUT = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const body = await request.json();
    const settings = payrollSettingsSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({
        where: { id: orgId },
        select: { payrollSettings: true },
      });

      await tx.organization.update({
        where: { id: orgId },
        data: { payrollSettings: settings },
      });

      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "UPDATE",
        entityType: "Organization",
        entityId: orgId,
        oldData: existing?.payrollSettings ?? null,
        newData: { event: "PAYROLL_SETTINGS_UPDATED", ...settings },
      });
    });

    return NextResponse.json({ data: settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error saving payroll settings");
    return NextResponse.json(
      { error: "Failed to save payroll settings" },
      { status: 500 }
    );
  }
});
