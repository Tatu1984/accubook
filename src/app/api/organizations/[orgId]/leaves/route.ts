import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createLeaveSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  leaveTypeId: z.string().min(1, "Leave type is required"),
  fromDate: z.string().transform((val) => new Date(val)),
  toDate: z.string().transform((val) => new Date(val)),
  reason: z.string().optional(),
});

const approveLeaveSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
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
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const leaveTypeId = searchParams.get("leaveTypeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {
      employee: { organizationId: orgId },
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (status) {
      where.status = status;
    }

    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId;
    }

    if (startDate && endDate) {
      where.OR = [
        {
          fromDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        {
          toDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
      ];
    }

    const [leaves, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  name: true,
                },
              },
            },
          },
          leaveType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leave.count({ where }),
    ]);

    return NextResponse.json({
      data: leaves,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching leaves:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaves" },
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
    });

    if (!orgUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = createLeaveSchema.parse(body);

    // Verify employee belongs to organization
    const employee = await prisma.employee.findFirst({
      where: {
        id: validatedData.employeeId,
        organizationId: orgId,
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Verify leave type exists
    const leaveType = await prisma.leaveType.findUnique({
      where: {
        id: validatedData.leaveTypeId,
      },
    });

    if (!leaveType) {
      return NextResponse.json(
        { error: "Leave type not found" },
        { status: 404 }
      );
    }

    // Calculate days
    const start = validatedData.fromDate;
    const end = validatedData.toDate;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check for overlapping leaves
    const overlapping = await prisma.leave.findFirst({
      where: {
        employeeId: validatedData.employeeId,
        status: { not: "REJECTED" },
        OR: [
          {
            fromDate: { lte: end },
            toDate: { gte: start },
          },
        ],
      },
    });

    if (overlapping) {
      return NextResponse.json(
        { error: "Leave dates overlap with existing leave request" },
        { status: 400 }
      );
    }

    const leave = await prisma.leave.create({
      data: {
        employeeId: validatedData.employeeId,
        leaveTypeId: validatedData.leaveTypeId,
        fromDate: validatedData.fromDate,
        toDate: validatedData.toDate,
        days,
        reason: validatedData.reason,
        status: "PENDING",
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        leaveType: true,
      },
    });

    return NextResponse.json(leave, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating leave:", error);
    return NextResponse.json(
      { error: "Failed to create leave" },
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
    const { leaveId, ...updateData } = body;

    if (!leaveId) {
      return NextResponse.json(
        { error: "Leave ID is required" },
        { status: 400 }
      );
    }

    const validatedData = approveLeaveSchema.parse(updateData);

    // Verify leave exists and belongs to organization
    const leave = await prisma.leave.findFirst({
      where: {
        id: leaveId,
        employee: { organizationId: orgId },
      },
    });

    if (!leave) {
      return NextResponse.json(
        { error: "Leave not found" },
        { status: 404 }
      );
    }

    if (leave.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only approve/reject pending leaves" },
        { status: 400 }
      );
    }

    // Get approver's name for storing
    const approver = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    const updatedLeave = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: validatedData.status,
        approvedBy: approver?.name || session.user.id,
        notes: validatedData.notes,
        approvedAt: new Date(),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        leaveType: true,
      },
    });

    return NextResponse.json(updatedLeave);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating leave:", error);
    return NextResponse.json(
      { error: "Failed to update leave" },
      { status: 500 }
    );
  }
}
