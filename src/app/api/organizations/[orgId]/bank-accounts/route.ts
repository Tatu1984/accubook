import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;

    const bankAccounts = await prisma.bankAccount.findMany({
      where: {
        organizationId: orgId,
      },
      include: {
        ledgers: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            receipts: true,
            payments: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(bankAccounts);
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch bank accounts" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;
    const body = await request.json();

    const {
      name,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      swiftCode,
      accountType,
      openingBalance,
    } = body;

    if (!name || !bankName || !accountNumber || !accountType) {
      return NextResponse.json(
        { error: "Name, bank name, account number, and account type are required" },
        { status: 400 }
      );
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        name,
        bankName,
        branch,
        accountNumber,
        ifscCode,
        swiftCode,
        accountType,
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
      },
    });

    return NextResponse.json(bankAccount, { status: 201 });
  } catch (error) {
    console.error("Error creating bank account:", error);
    return NextResponse.json(
      { error: "Failed to create bank account" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Bank account ID is required" },
        { status: 400 }
      );
    }

    const bankAccount = await prisma.bankAccount.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: updateData,
    });

    return NextResponse.json(bankAccount);
  } catch (error) {
    console.error("Error updating bank account:", error);
    return NextResponse.json(
      { error: "Failed to update bank account" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    await cookies();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Bank account ID is required" },
        { status: 400 }
      );
    }

    // Check if bank account has transactions
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id, organizationId: orgId },
      include: {
        _count: {
          select: {
            receipts: true,
            payments: true,
          },
        },
      },
    });

    if (!bankAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 404 }
      );
    }

    if (bankAccount._count.receipts > 0 || bankAccount._count.payments > 0) {
      // Soft delete by marking as inactive
      await prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "Bank account deactivated", softDeleted: true });
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Bank account deleted", softDeleted: false });
  } catch (error) {
    console.error("Error deleting bank account:", error);
    return NextResponse.json(
      { error: "Failed to delete bank account" },
      { status: 500 }
    );
  }
}
