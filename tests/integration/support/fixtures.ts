/**
 * Minimal real records for DB-backed tests.
 *
 * Built through the application's own `provisionOrganization` rather than
 * hand-inserting a chart of accounts, so the fixtures stay correct as the
 * seeded ledgers change. A test that invents its own "Salaries Payable"
 * would keep passing after the real one was renamed.
 */
import type { PrismaClient } from "@/generated/prisma";
import {
  provisionOrganization,
  ensureBaseCurrency,
} from "@/backend/services/organization/provision";

export type PayrollFixture = {
  organizationId: string;
  userId: string;
  employeeId: string;
  payslipId: string;
  month: number;
  year: number;
};

/** VoucherTypes are global (unique on `code`), not per-organization. */
async function ensureVoucherTypes(db: PrismaClient): Promise<void> {
  for (const vt of [
    { name: "Journal", code: "JOURNAL", nature: "JOURNAL" },
    { name: "Payment", code: "PAYMENT", nature: "PAYMENT" },
    { name: "Receipt", code: "RECEIPT", nature: "RECEIPT" },
  ]) {
    await db.voucherType.upsert({
      where: { code: vt.code },
      update: {},
      create: vt,
    });
  }
}

/**
 * An organization with a chart of accounts, one employee, and one
 * unposted payslip for the given month — the exact precondition
 * `POST /payroll/post-month` looks for.
 *
 * Amounts are internally consistent (net == gross − deductions) so the
 * journal balances; an imbalance would trip the Phase 2.2B assertion and
 * mask whatever a concurrency test is trying to show.
 */
export async function createPayrollFixture(
  db: PrismaClient,
  opts: { month?: number; year?: number } = {}
): Promise<PayrollFixture> {
  const month = opts.month ?? 6;
  const year = opts.year ?? 2025;

  await ensureVoucherTypes(db);
  await db.currency.upsert({
    where: { code: "INR" },
    update: {},
    create: { code: "INR", name: "Indian Rupee", symbol: "₹" },
  });

  const user = await db.user.create({
    data: {
      email: `payroll-${Date.now()}-${Math.round(performance.now())}@test.local`,
      name: "Payroll Tester",
      isActive: true,
    },
  });

  const org = await db.organization.create({
    data: { name: "Concurrency Test Co", isActive: true },
  });

  await db.$transaction(async (tx) => {
    await ensureBaseCurrency(tx, org.id);
    await provisionOrganization(tx, {
      organizationId: org.id,
      // Inside the fiscal year that contains the payslip month, so
      // `getFiscalYearForDate` resolves during posting.
      on: new Date(Date.UTC(year, month - 1, 15)),
    });
  });

  const employee = await db.employee.create({
    data: {
      organizationId: org.id,
      employeeCode: "EMP001",
      firstName: "Asha",
      lastName: "Rao",
      joiningDate: new Date(Date.UTC(year - 1, 0, 1)),
      ctc: 600000,
      status: "ACTIVE",
    },
  });

  // gross 50000 − (1800 PF + 7200 TDS) = 41000 net.
  const payslip = await db.payslip.create({
    data: {
      employeeId: employee.id,
      month,
      year,
      basicSalary: 25000,
      grossSalary: 50000,
      netSalary: 41000,
      totalDeductions: 9000,
      workingDays: 30,
      presentDays: 30,
      lopDays: 0,
      status: "APPROVED",
      earnings: [{ component: "Basic Salary", amount: 25000 }],
      deductions: [
        { component: "PF (Employee)", amount: 1800 },
        { component: "TDS", amount: 7200 },
      ],
    },
  });

  return {
    organizationId: org.id,
    userId: user.id,
    employeeId: employee.id,
    payslipId: payslip.id,
    month,
    year,
  };
}

/**
 * Add a bank account to an existing fixture organization.
 *
 * `pay-month` treats `bankAccountId` as optional and falls back to
 * "Cash in Hand", but a real bank account exercises the extra
 * `BankAccount.currentBalance` decrement — which is the second place a
 * double payment would show up.
 */
export async function createBankAccount(
  db: PrismaClient,
  organizationId: string,
  openingBalance = 500000
): Promise<{ id: string; name: string }> {
  const account = await db.bankAccount.create({
    data: {
      organizationId,
      name: "Test Current A/c",
      accountNumber: `TEST${Date.now()}`,
      bankName: "Test Bank",
      accountType: "CURRENT",
      openingBalance,
      currentBalance: openingBalance,
      isActive: true,
    },
    select: { id: true, name: true },
  });
  return account;
}

export type WorkOrderFixture = {
  organizationId: string;
  userId: string;
  workOrderId: string;
  finishedItemId: string;
  warehouseId: string;
  /** Total value of raw material issued to the WO. */
  issuedValue: number;
};

/**
 * A work order sitting at IN_PROGRESS with material already issued —
 * the precondition `POST .../work-orders/[id]/complete` looks for.
 *
 * The ISSUE stock movement is created directly rather than by driving the
 * issue route, so the fixture states exactly what has been consumed. The
 * completion path only ever reads those movements back, so this is the
 * same input it would see in production.
 */
export async function createWorkOrderFixture(
  db: PrismaClient,
  opts: { issuedValue?: number; plannedQuantity?: number } = {}
): Promise<WorkOrderFixture> {
  const issuedValue = opts.issuedValue ?? 5000;
  const plannedQuantity = opts.plannedQuantity ?? 10;

  await ensureVoucherTypes(db);
  await db.currency.upsert({
    where: { code: "INR" },
    update: {},
    create: { code: "INR", name: "Indian Rupee", symbol: "₹" },
  });

  const user = await db.user.create({
    data: {
      email: `wo-${Date.now()}-${Math.round(performance.now())}@test.local`,
      name: "WO Tester",
      isActive: true,
    },
  });
  const org = await db.organization.create({
    data: { name: "WO Concurrency Co", isActive: true },
  });

  const provisioned = await db.$transaction(async (tx) => {
    await ensureBaseCurrency(tx, org.id);
    return provisionOrganization(tx, {
      organizationId: org.id,
      on: new Date(Date.UTC(2025, 5, 15)),
    });
  });

  const unit = await db.unitOfMeasure.create({
    data: { name: "Piece", symbol: `PC${Date.now() % 100000}` },
  });

  const finished = await db.item.create({
    data: {
      organizationId: org.id,
      name: "Finished Widget",
      sku: `FG-${Date.now()}`,
      type: "GOODS",
      primaryUnitId: unit.id,
      isActive: true,
    },
  });
  const raw = await db.item.create({
    data: {
      organizationId: org.id,
      name: "Raw Material",
      sku: `RM-${Date.now()}`,
      type: "GOODS",
      primaryUnitId: unit.id,
      isActive: true,
    },
  });

  const bom = await db.bom.create({
    data: {
      organizationId: org.id,
      itemId: finished.id,
      bomNumber: `BOM-${Date.now()}`,
      outputQuantity: plannedQuantity,
      outputUnitId: unit.id,
      isActive: true,
      components: {
        create: [
          { itemId: raw.id, quantity: plannedQuantity, unitId: unit.id, unitCost: issuedValue / plannedQuantity },
        ],
      },
    },
  });

  const workOrder = await db.workOrder.create({
    data: {
      organizationId: org.id,
      workOrderNumber: `WO-${Date.now()}`,
      bomId: bom.id,
      itemId: finished.id,
      plannedQuantity,
      warehouseId: provisioned.warehouseId,
      status: "IN_PROGRESS",
      startDate: new Date(Date.UTC(2025, 5, 10)),
    },
  });

  // Material already issued to the WO. `complete` sums these to derive
  // the WIP value it relieves.
  await db.stockMovement.create({
    data: {
      itemId: raw.id,
      fromWarehouseId: provisioned.warehouseId,
      unitId: unit.id,
      movementType: "ISSUE",
      quantity: plannedQuantity,
      rate: issuedValue / plannedQuantity,
      totalValue: issuedValue,
      referenceType: "WORK_ORDER",
      referenceId: workOrder.id,
      date: new Date(Date.UTC(2025, 5, 12)),
    },
  });

  return {
    organizationId: org.id,
    userId: user.id,
    workOrderId: workOrder.id,
    finishedItemId: finished.id,
    warehouseId: provisioned.warehouseId,
    issuedValue,
  };
}
