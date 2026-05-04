import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, hasPermission, forbidden } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { writeAudit } from "@/backend/utils/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/organizations/[orgId]
 *
 * Update editable organization fields. Strict allow-list of fields the
 * caller can change so a request body with extra keys can't smuggle a
 * baseCurrencyId switch through.
 *
 * Permission: settings:update.
 */
const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(300).nullable().optional(),
  registrationNo: z.string().max(100).nullable().optional(),
  taxId: z.string().max(100).nullable().optional(),
  gstNo: z.string().max(20).nullable().optional(),
  panNo: z.string().max(20).nullable().optional(),
  tanNo: z.string().max(20).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  country: z.string().max(2).optional(),
  postalCode: z.string().max(20).nullable().optional(),
  // India composition scheme controls — see schema docstring on
  // Organization.compositionScheme.
  compositionScheme: z.boolean().optional(),
  compositionRate: z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return v;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return n;
    }),
}).strict();

export const GET = withOrgAuth(async (_, { orgId, orgUser }) => {
  // GST/PAN/TAN are legally identifying and shouldn't leak to every
  // org member. Gate the read on the same permission as PATCH.
  if (!hasPermission(orgUser, "settings", "read")) {
    return forbidden("You don't have permission to read organization settings");
  }
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        legalName: true,
        registrationNo: true,
        taxId: true,
        gstNo: true,
        panNo: true,
        tanNo: true,
        website: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        baseCurrencyId: true,
        fiscalYearStart: true,
        compositionScheme: true,
        compositionRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (error) {
    logger.error({ err: error }, "Error reading organization");
    return NextResponse.json({ error: "Failed to read organization" }, { status: 500 });
  }
});

export const PATCH = withOrgAuth(async (request, { orgId, orgUser, userId }) => {
  if (!hasPermission(orgUser, "settings", "update")) {
    return forbidden("You don't have permission to edit organization settings");
  }
  try {
    const body = await request.json();
    const data = patchSchema.parse(body);

    if (data.compositionScheme === true) {
      const rate = data.compositionRate ?? null;
      if (rate === null) {
        // Allow leaving rate untouched if it's already set.
        const existing = await prisma.organization.findUnique({
          where: { id: orgId },
          select: { compositionRate: true },
        });
        if (!existing?.compositionRate) {
          return badRequest("compositionRate is required when enabling composition scheme");
        }
      }
    }

    const before = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { compositionScheme: true, compositionRate: true, gstNo: true, state: true },
    });

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.organization.update({
        where: { id: orgId },
        data,
      });
      await writeAudit(tx, {
        organizationId: orgId,
        userId,
        action: "UPDATE",
        entityType: "Organization",
        entityId: orgId,
        oldData: before,
        newData: data,
      });
      return u;
    });

    return NextResponse.json({
      ok: true,
      organization: {
        id: updated.id,
        name: updated.name,
        gstNo: updated.gstNo,
        state: updated.state,
        country: updated.country,
        compositionScheme: updated.compositionScheme,
        compositionRate: updated.compositionRate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating organization");
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }
});
