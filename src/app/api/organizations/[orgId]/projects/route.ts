import { NextResponse } from "next/server";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { z } from "zod";
import { logger } from "@/backend/utils/logger";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createProjectSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    code: z.string().optional(),
    description: z.string().optional(),
    startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
    budget: z.number().optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"]).default("ACTIVE"),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateProjectSchema = z
  .object({
    id: z.string().min(1, "Project ID is required"),
    name: z.string().min(1).optional(),
    code: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    startDate: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ? new Date(val) : val === null ? null : undefined)),
    endDate: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val ? new Date(val) : val === null ? null : undefined)),
    budget: z.number().nullable().optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const GET = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (status) {
      where.status = status;
    }

    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json({
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching projects");
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createProjectSchema.parse(body);

    // Check for duplicate name
    const existing = await prisma.project.findUnique({
      where: {
        organizationId_name: {
          organizationId: orgId,
          name: validatedData.name,
        },
      },
    });

    if (existing) {
      return badRequest("Project with this name already exists");
    }

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        name: validatedData.name,
        code: validatedData.code,
        description: validatedData.description,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        budget: validatedData.budget,
        status: validatedData.status,
        isActive: validatedData.isActive,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating project");
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const { id, ...updateData } = updateProjectSchema.parse(body);

    const existing = await prisma.project.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) return notFound("Project not found");

    const project = await prisma.project.update({
      where: { id, organizationId: orgId },
      data: updateData,
    });

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error updating project");
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return badRequest("Project ID is required");
    }

    const existing = await prisma.project.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { voucherEntries: true } } },
    });
    if (!existing) return notFound("Project not found");

    // Soft-delete if any voucher entries reference it — preserves books.
    if (existing._count.voucherEntries > 0) {
      await prisma.project.update({
        where: { id, organizationId: orgId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    await prisma.project.delete({
      where: { id, organizationId: orgId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting project");
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
});
