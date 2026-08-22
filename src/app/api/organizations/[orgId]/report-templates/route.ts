import { NextResponse } from "next/server";
import { z } from "zod";
import { optional } from "@/backend/validators/common";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saved report definitions.
 *
 * The Custom Reports screen had two "Create Report" buttons and no endpoint —
 * the `ReportTemplate` model existed in the schema with nothing reading or
 * writing it.
 *
 * A template pins a statement type and the period it covers, so a report the
 * user runs monthly does not have to be re-configured each time. Running one
 * goes through the existing `/reports/export` endpoint, which is where these
 * statements are actually produced.
 */

const REPORT_TYPES = [
  "BALANCE_SHEET",
  "PROFIT_LOSS",
  "CASH_FLOW",
  "TRIAL_BALANCE",
] as const;

const configSchema = z.object({
  /** Named period resolved at run time, e.g. "current-fy", "q1". */
  period: z.string().min(1).default("current-fy"),
  /** Fixed range, used when `period` is "custom". */
  startDate: optional(z.string()),
  endDate: optional(z.string()),
  format: z.enum(["xlsx", "csv", "json"]).default("xlsx"),
  notes: optional(z.string().max(500)),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  type: z.enum(REPORT_TYPES),
  config: configSchema.default(() => configSchema.parse({})),
});

export const GET = withOrgAuth(async (_request, { orgId }) => {
  try {
    const templates = await prisma.reportTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: templates });
  } catch (error) {
    logger.error({ err: error }, "Error fetching report templates");
    return NextResponse.json(
      { error: "Failed to fetch report templates" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    if (
      data.config.period === "custom" &&
      (!data.config.startDate || !data.config.endDate)
    ) {
      return badRequest("A custom period needs both a start and an end date");
    }

    const existing = await prisma.reportTemplate.findFirst({
      where: { organizationId: orgId, name: data.name },
      select: { id: true },
    });
    if (existing) {
      return badRequest(`A report named "${data.name}" already exists`);
    }

    const template = await prisma.reportTemplate.create({
      data: {
        organizationId: orgId,
        name: data.name,
        type: data.type,
        config: data.config,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating report template");
    return NextResponse.json(
      { error: "Failed to create report template" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { templateId, ...rest } = body as { templateId?: string };
    if (!templateId) return badRequest("Template ID is required");

    const data = createSchema.partial().parse(rest);

    const existing = await prisma.reportTemplate.findFirst({
      where: { id: templateId, organizationId: orgId },
    });
    if (!existing) return notFound("Report template not found");
    if (existing.isSystem) {
      return badRequest("System report templates cannot be edited");
    }

    const template = await prisma.reportTemplate.update({
      where: { id: templateId },
      data: {
        name: data.name,
        type: data.type,
        config: data.config,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating report template");
    return NextResponse.json(
      { error: "Failed to update report template" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId");
    if (!templateId) return badRequest("Template ID is required");

    const existing = await prisma.reportTemplate.findFirst({
      where: { id: templateId, organizationId: orgId },
    });
    if (!existing) return notFound("Report template not found");
    if (existing.isSystem) {
      return badRequest("System report templates cannot be deleted");
    }

    await prisma.reportTemplate.delete({ where: { id: templateId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting report template");
    return NextResponse.json(
      { error: "Failed to delete report template" },
      { status: 500 }
    );
  }
});
