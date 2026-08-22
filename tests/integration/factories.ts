import { prisma } from "@/backend/database/client";

/**
 * Builders for the minimum realistic world a test needs.
 *
 * Almost every behaviour worth testing here — costing, dispatch, GL posting,
 * tenant scoping — needs an organization with ledger groups, a warehouse, a
 * unit of measure and at least one item before it can even begin. Without
 * these, each test would open with the same eighty lines of setup and the
 * thing actually under test would be invisible.
 *
 * Everything takes overrides so a test can vary the one field it cares about
 * and ignore the rest.
 */

let sequence = 0;
const uniq = (prefix: string) => `${prefix}-${++sequence}-${Date.now().toString(36)}`;

export interface TestOrg {
  orgId: string;
  userId: string;
  unitId: string;
  warehouseId: string;
  secondWarehouseId: string;
  customerId: string;
  vendorId: string;
  voucherTypeId: string;
  groups: Record<string, string>;
}

/** An organization with the chart-of-accounts skeleton the posting code expects. */
export async function createTestOrg(
  overrides: { name?: string; compositionScheme?: boolean; state?: string } = {}
): Promise<TestOrg> {
  const org = await prisma.organization.create({
    data: {
      name: overrides.name ?? uniq("Test Org"),
      country: "IN",
      state: overrides.state ?? "Maharashtra",
      gstNo: "27AAAAA0000A1Z5",
      compositionScheme: overrides.compositionScheme ?? false,
    },
  });

  const user = await prisma.user.create({
    data: { email: `${uniq("user")}@example.test`, name: "Test User" },
  });

  const role = await prisma.role.create({
    data: {
      name: uniq("ADMIN"),
      permissions: [{ module: "*", category: "*", actions: ["*"] }],
      isSystem: false,
    },
  });

  await prisma.organizationUser.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      roleId: role.id,
      isActive: true,
    },
  });

  // The five natures the reports and posting helpers look ledgers up by.
  const groupSpecs: { key: string; name: string; nature: string; gp?: boolean }[] = [
    { key: "assets", name: "Current Assets", nature: "ASSETS" },
    { key: "stock", name: "Stock-in-Hand", nature: "ASSETS" },
    { key: "debtors", name: "Sundry Debtors", nature: "ASSETS" },
    { key: "liabilities", name: "Current Liabilities", nature: "LIABILITIES" },
    { key: "creditors", name: "Sundry Creditors", nature: "LIABILITIES" },
    { key: "equity", name: "Capital Account", nature: "EQUITY" },
    { key: "income", name: "Sales Accounts", nature: "INCOME", gp: true },
    { key: "expenses", name: "Indirect Expenses", nature: "EXPENSES" },
    { key: "direct", name: "Purchase Accounts", nature: "EXPENSES", gp: true },
  ];

  const groups: Record<string, string> = {};
  for (const spec of groupSpecs) {
    const group = await prisma.ledgerGroup.create({
      data: {
        organizationId: org.id,
        name: spec.name,
        nature: spec.nature,
        affectsGrossProfit: spec.gp ?? false,
        isSystem: true,
      },
    });
    groups[spec.key] = group.id;
  }

  const unit = await prisma.unitOfMeasure.create({
    data: { name: uniq("Piece"), symbol: uniq("pc").slice(0, 8) },
  });

  const [warehouse, secondWarehouse] = await Promise.all([
    prisma.warehouse.create({
      data: { organizationId: org.id, name: "Main Warehouse", isDefault: true },
    }),
    prisma.warehouse.create({
      data: { organizationId: org.id, name: "Overflow Warehouse" },
    }),
  ]);

  const [customer, vendor] = await Promise.all([
    prisma.party.create({
      data: {
        organizationId: org.id,
        name: uniq("Customer"),
        type: "CUSTOMER",
        email: `${uniq("cust")}@example.test`,
        billingState: "Maharashtra",
      },
    }),
    prisma.party.create({
      data: {
        organizationId: org.id,
        name: uniq("Vendor"),
        type: "VENDOR",
        billingState: "Maharashtra",
      },
    }),
  ]);

  // `VoucherType.code` is globally unique in the schema, so it has to be
  // uniquified per test organization rather than reusing a fixed "JV".
  const voucherType = await prisma.voucherType.create({
    data: { name: "Journal", code: uniq("JV"), nature: "JOURNAL" },
  });

  return {
    orgId: org.id,
    userId: user.id,
    unitId: unit.id,
    warehouseId: warehouse.id,
    secondWarehouseId: secondWarehouse.id,
    customerId: customer.id,
    vendorId: vendor.id,
    voucherTypeId: voucherType.id,
    groups,
  };
}

/** The fiscal year containing `date`, created on demand. India: April to March. */
export async function ensureFiscalYear(org: TestOrg, date: Date) {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const name = `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

  return prisma.fiscalYear.upsert({
    where: { organizationId_name: { organizationId: org.orgId, name } },
    create: {
      organizationId: org.orgId,
      name,
      startDate: new Date(Date.UTC(startYear, 3, 1)),
      endDate: new Date(Date.UTC(startYear + 1, 2, 31)),
    },
    update: {},
  });
}

async function ensureLedger(org: TestOrg, groupKey: string, name: string) {
  const existing = await prisma.ledger.findFirst({
    where: { organizationId: org.orgId, name },
  });
  if (existing) return existing;
  return prisma.ledger.create({
    data: {
      organizationId: org.orgId,
      groupId: org.groups[groupKey],
      name,
    },
  });
}

/**
 * A balanced, approved journal voucher — the only way to get real ledger data
 * in front of the report routes without going through a full sales flow.
 */
export async function postJournal(
  org: TestOrg,
  entries: {
    groupKey: string;
    ledgerName: string;
    debit?: number;
    credit?: number;
  }[],
  date: Date
) {
  const fiscalYear = await ensureFiscalYear(org, date);

  const resolved = [];
  for (const entry of entries) {
    resolved.push({
      ledger: await ensureLedger(org, entry.groupKey, entry.ledgerName),
      entry,
    });
  }

  const totalDebit = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Test journal is unbalanced: Dr ${totalDebit} vs Cr ${totalCredit}`
    );
  }

  return prisma.voucher.create({
    data: {
      organizationId: org.orgId,
      fiscalYearId: fiscalYear.id,
      voucherTypeId: org.voucherTypeId,
      voucherNumber: uniq("JV"),
      date,
      status: "APPROVED",
      isPosted: true,
      postedAt: date,
      createdById: org.userId,
      totalDebit,
      totalCredit,
      entries: {
        create: resolved.map(({ ledger, entry }, index) => ({
          ledgerId: ledger.id,
          debitAmount: entry.debit ?? 0,
          creditAmount: entry.credit ?? 0,
          sequence: index,
        })),
      },
    },
  });
}

export async function createItem(
  org: TestOrg,
  overrides: {
    name?: string;
    sku?: string;
    valuationMethod?: string;
    purchasePrice?: number;
    sellingPrice?: number;
  } = {}
) {
  return prisma.item.create({
    data: {
      organizationId: org.orgId,
      name: overrides.name ?? uniq("Item"),
      sku: overrides.sku ?? uniq("SKU"),
      primaryUnitId: org.unitId,
      type: "GOODS",
      valuationMethod: overrides.valuationMethod ?? "FIFO",
      purchasePrice: overrides.purchasePrice ?? 100,
      sellingPrice: overrides.sellingPrice ?? 150,
    },
  });
}

/** Put quantity on a shelf at a known unit cost. */
export async function seedStock(
  itemId: string,
  warehouseId: string,
  quantity: number,
  avgCost = 100
) {
  return prisma.stock.upsert({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    create: { itemId, warehouseId, quantity, avgCost },
    update: { quantity, avgCost },
  });
}

/**
 * An issued invoice — the state where the sale is on the books and the goods
 * are owed to a customer, which is what makes stock "in progress".
 */
export async function createIssuedInvoice(
  org: TestOrg,
  lines: { itemId: string; quantity: number; unitPrice: number }[],
  overrides: { status?: string; date?: Date; invoiceNumber?: string } = {}
) {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const date = overrides.date ?? new Date();

  return prisma.invoice.create({
    data: {
      organizationId: org.orgId,
      partyId: org.customerId,
      invoiceNumber: overrides.invoiceNumber ?? uniq("INV"),
      date,
      dueDate: new Date(date.getTime() + 30 * 86_400_000),
      type: "INVOICE",
      status: overrides.status ?? "SENT",
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      amountDue: subtotal,
      items: {
        create: lines.map((line, index) => ({
          itemId: line.itemId,
          description: `Line ${index + 1}`,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxableAmount: line.quantity * line.unitPrice,
          totalAmount: line.quantity * line.unitPrice,
          sequence: index,
        })),
      },
    },
    include: { items: true },
  });
}
