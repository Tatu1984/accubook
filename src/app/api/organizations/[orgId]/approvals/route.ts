import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/backend/database/client";
import { withOrgAuth, badRequest, notFound } from "@/backend/utils/with-org-auth";
import { logger } from "@/backend/utils/logger";
import { maybePromoteEntity } from "@/backend/services/approvals/promote-entity";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  entityType: z.string().min(1, "Entity type is required"),
  isActive: z.boolean().default(true),
  steps: z.array(z.object({
    stepNumber: z.number().min(1),
    approverType: z.enum(["ROLE", "USER", "MANAGER"]),
    approverId: z.string().optional(),
    amountLimit: z.number().optional(),
    isRequired: z.boolean().default(true),
  })).min(1, "At least one step is required"),
});

const processApprovalSchema = z.object({
  approvalId: z.string().min(1, "Approval ID is required"),
  action: z.enum(["APPROVE", "REJECT"]),
  comments: z.string().optional(),
}).strict();

export const GET = withOrgAuth(async (request, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "workflows";
    const entityType = searchParams.get("entityType");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (view === "pending") {
      // Get pending approvals for current user
      const where: Record<string, unknown> = {
        approverId: userId,
        status: "PENDING",
      };

      if (entityType) {
        where.entityType = entityType;
      }

      const [approvals, total] = await Promise.all([
        prisma.approval.findMany({
          where,
          include: {
            requester: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.approval.count({ where }),
      ]);

      return NextResponse.json({
        data: approvals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } else if (view === "history") {
      // Get approval history
      const where: Record<string, unknown> = {
        OR: [
          { approverId: userId },
          { requesterId: userId },
        ],
        status: { not: "PENDING" },
      };

      if (entityType) {
        where.entityType = entityType;
      }

      if (status) {
        where.status = status;
      }

      const [approvals, total] = await Promise.all([
        prisma.approval.findMany({
          where,
          include: {
            approver: {
              select: {
                id: true,
                name: true,
              },
            },
            requester: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { approvedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.approval.count({ where }),
      ]);

      return NextResponse.json({
        data: approvals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } else {
      // Get workflows
      const where: Record<string, unknown> = {
        organizationId: orgId,
      };

      if (entityType) {
        where.entityType = entityType;
      }

      const [workflows, total] = await Promise.all([
        prisma.approvalWorkflow.findMany({
          where,
          include: {
            steps: {
              orderBy: { stepNumber: "asc" },
            },
          },
          orderBy: { name: "asc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.approvalWorkflow.count({ where }),
      ]);

      return NextResponse.json({
        data: workflows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error fetching approvals");
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
});

export const POST = withOrgAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const validatedData = createWorkflowSchema.parse(body);

    // Check for duplicate name
    const existingWorkflow = await prisma.approvalWorkflow.findFirst({
      where: {
        organizationId: orgId,
        name: validatedData.name,
      },
    });

    if (existingWorkflow) {
      return badRequest("Workflow with this name already exists");
    }

    const workflow = await prisma.approvalWorkflow.create({
      data: {
        organizationId: orgId,
        name: validatedData.name,
        entityType: validatedData.entityType,
        isActive: validatedData.isActive,
        steps: {
          create: validatedData.steps.map((step) => ({
            stepNumber: step.stepNumber,
            approverType: step.approverType,
            approverId: step.approverId,
            amountLimit: step.amountLimit,
            isRequired: step.isRequired,
          })),
        },
      },
      include: {
        steps: {
          orderBy: { stepNumber: "asc" },
        },
      },
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error creating workflow");
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
});

export const PATCH = withOrgAuth(async (request, { userId }) => {
  try {
    const body = await request.json();

    // Check if this is processing an approval
    if (body.approvalId) {
      const validatedData = processApprovalSchema.parse(body);

      // Verify approval exists and user can approve
      const approval = await prisma.approval.findFirst({
        where: {
          id: validatedData.approvalId,
          status: "PENDING",
          approverId: userId,
        },
      });

      if (!approval) {
        return notFound("Approval not found or you don't have permission");
      }

      const { updatedApproval, promotion, siblingsCancelled } = await prisma.$transaction(async (tx) => {
        const u = await tx.approval.update({
          where: { id: validatedData.approvalId },
          data: {
            status: validatedData.action === "APPROVE" ? "APPROVED" : "REJECTED",
            approvedAt: new Date(),
            comments: validatedData.comments,
          },
          include: {
            requester: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        });
        // ROLE-step cleanup: when an approver acts, cancel every other
        // PENDING Approval at the same (entityType, entityId, stepNumber).
        // Those are the rows created for the other holders of the role —
        // any one of them is enough; keeping the rest open clutters
        // every other holder's inbox after the decision is made.
        const siblings = await tx.approval.updateMany({
          where: {
            entityType: u.entityType,
            entityId: u.entityId,
            stepNumber: u.stepNumber,
            status: "PENDING",
            id: { not: u.id },
          },
          data: {
            status: "CANCELLED",
            approvedAt: new Date(),
            comments: `Auto-cancelled — ${u.requester.name ?? "approver"} already decided this step.`,
          },
        });
        // Auto-promote / demote the underlying entity once all
        // approvals have decided. Catches both the "all APPROVED →
        // post the voucher" and "any REJECTED → kick it back" paths.
        const p = await maybePromoteEntity(tx, u.entityType, u.entityId);
        return { updatedApproval: u, promotion: p, siblingsCancelled: siblings.count };
      });

      return NextResponse.json({ ...updatedApproval, promotion, siblingsCancelled });
    }

    return badRequest("Invalid request");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest("Validation failed", error.issues);
    }
    logger.error({ err: error }, "Error processing approval");
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
});

export const DELETE = withOrgAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");

    if (!workflowId) {
      return badRequest("Workflow ID is required");
    }

    // Verify workflow exists and belongs to organization
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: {
        id: workflowId,
        organizationId: orgId,
      },
    });

    if (!workflow) {
      return notFound("Workflow not found");
    }

    // Delete steps first, then workflow
    await prisma.$transaction([
      prisma.approvalWorkflowStep.deleteMany({
        where: { workflowId },
      }),
      prisma.approvalWorkflow.delete({
        where: { id: workflowId },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting workflow");
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
});
