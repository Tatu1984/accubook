import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// Force Node.js runtime for this route
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Available permissions for display
export const AVAILABLE_PERMISSIONS = [
  // Dashboard
  "view_dashboard",

  // Accounting
  "view_accounting",
  "manage_chart_of_accounts",
  "manage_ledgers",
  "create_vouchers",
  "approve_vouchers",
  "delete_vouchers",

  // Sales
  "view_sales",
  "create_quotations",
  "create_sales_orders",
  "create_invoices",
  "approve_sales",
  "manage_receipts",

  // Purchases
  "view_purchases",
  "create_purchase_orders",
  "create_bills",
  "approve_purchases",
  "manage_payments",

  // Inventory
  "view_inventory",
  "manage_items",
  "manage_warehouses",
  "manage_stock",
  "view_stock_reports",

  // Banking
  "view_banking",
  "manage_bank_accounts",
  "perform_reconciliation",

  // HR & Payroll
  "view_hr",
  "manage_employees",
  "manage_attendance",
  "manage_leaves",
  "approve_leaves",
  "manage_payroll",
  "approve_payroll",

  // Reports
  "view_reports",
  "export_reports",

  // Settings
  "view_settings",
  "manage_organization",
  "manage_users",
  "manage_roles",
  "manage_taxes",
  "manage_workflows",
];

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
    const includeUserCount = searchParams.get("includeUserCount") === "true";

    // Get all system roles
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
    });

    if (includeUserCount) {
      // Get user counts per role for this organization
      const roleCounts = await prisma.organizationUser.groupBy({
        by: ["roleId"],
        where: { organizationId: orgId },
        _count: { roleId: true },
      });

      const countMap = new Map(
        roleCounts.map((rc) => [rc.roleId, rc._count.roleId])
      );

      const rolesWithCount = roles.map((role) => ({
        ...role,
        userCount: countMap.get(role.id) || 0,
      }));

      return NextResponse.json({
        data: rolesWithCount,
        availablePermissions: AVAILABLE_PERMISSIONS,
      });
    }

    return NextResponse.json({
      data: roles,
      availablePermissions: AVAILABLE_PERMISSIONS,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}
