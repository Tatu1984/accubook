import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

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
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "workflows";
    const entityType = searchParams.get("entityType");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (view === "pending") {
      // Get pending approvals for current user
      const where: Record<string, unknown> = {
        approverId: session.user.id,
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
          { approverId: session.user.id },
          { requesterId: session.user.id },
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
    console.error("Error fetching approvals:", error);
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: {
        role: true,
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
      return NextResponse.json(
        { error: "Workflow with this name already exists" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating workflow:", error);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();

    // Check if this is processing an approval
    if (body.approvalId) {
      const validatedData = processApprovalSchema.parse(body);

      // Verify approval exists and user can approve
      const approval = await prisma.approval.findFirst({
        where: {
          id: validatedData.approvalId,
          status: "PENDING",
          approverId: session.user.id,
        },
      });

      if (!approval) {
        return NextResponse.json(
          { error: "Approval not found or you don't have permission" },
          { status: 404 }
        );
      }

      const updatedApproval = await prisma.approval.update({
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

      return NextResponse.json(updatedApproval);
    }

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error processing approval:", error);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();
    const { orgId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgUser = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: session.user.id,
        },
      },
      include: {
        role: true,
      },
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json(
        { error: "Workflow ID is required" },
        { status: 400 }
      );
    }

    // Verify workflow exists and belongs to organization
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: {
        id: workflowId,
        organizationId: orgId,
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
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
    console.error("Error deleting workflow:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
