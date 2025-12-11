import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { z } from "zod";

const createAttendanceSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().transform((val) => new Date(val)),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "LATE", "ON_LEAVE", "HOLIDAY", "WEEK_OFF"]).default("PRESENT"),
  notes: z.string().optional(),
});

const bulkAttendanceSchema = z.object({
  date: z.string().transform((val) => new Date(val)),
  attendances: z.array(z.object({
    employeeId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "LATE", "ON_LEAVE", "HOLIDAY", "WEEK_OFF"]),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    notes: z.string().optional(),
  })),
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
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {
      employee: { organizationId: orgId },
    };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (date) {
      where.date = new Date(date);
    } else if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (status) {
      where.status = status;
    }

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
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
        },
        orderBy: [
          { date: "desc" },
          { employee: { firstName: "asc" } },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return NextResponse.json({
      data: attendances,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance" },
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

    // Check if it's a bulk attendance request
    if (body.attendances) {
      const validatedData = bulkAttendanceSchema.parse(body);

      // Verify all employees belong to organization
      const employeeIds = validatedData.attendances.map((a) => a.employeeId);
      const employees = await prisma.employee.findMany({
        where: {
          id: { in: employeeIds },
          organizationId: orgId,
        },
        select: { id: true },
      });

      const validEmployeeIds = new Set(employees.map((e) => e.id));
      const invalidEmployees = employeeIds.filter((id) => !validEmployeeIds.has(id));

      if (invalidEmployees.length > 0) {
        return NextResponse.json(
          { error: "Some employees not found", invalidEmployees },
          { status: 400 }
        );
      }

      // Upsert all attendance records
      const results = await prisma.$transaction(
        validatedData.attendances.map((attendance) =>
          prisma.attendance.upsert({
            where: {
              employeeId_date: {
                employeeId: attendance.employeeId,
                date: validatedData.date,
              },
            },
            update: {
              status: attendance.status,
              checkIn: attendance.checkIn,
              checkOut: attendance.checkOut,
              notes: attendance.notes,
            },
            create: {
              employeeId: attendance.employeeId,
              date: validatedData.date,
              status: attendance.status,
              checkIn: attendance.checkIn,
              checkOut: attendance.checkOut,
              notes: attendance.notes,
            },
          })
        )
      );

      return NextResponse.json({ data: results, count: results.length }, { status: 201 });
    } else {
      // Single attendance record
      const validatedData = createAttendanceSchema.parse(body);

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

      const attendance = await prisma.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId: validatedData.employeeId,
            date: validatedData.date,
          },
        },
        update: {
          status: validatedData.status,
          checkIn: validatedData.checkIn,
          checkOut: validatedData.checkOut,
          notes: validatedData.notes,
        },
        create: {
          employeeId: validatedData.employeeId,
          date: validatedData.date,
          status: validatedData.status,
          checkIn: validatedData.checkIn,
          checkOut: validatedData.checkOut,
          notes: validatedData.notes,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return NextResponse.json(attendance, { status: 201 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating attendance:", error);
    return NextResponse.json(
      { error: "Failed to create attendance" },
      { status: 500 }
    );
  }
}
