import type { Prisma } from "@/generated/prisma";

type Tx = Prisma.TransactionClient;

/**
 * One definition of "what a usable organization contains".
 *
 * Before this existed, `prisma/seed.ts` and `POST /api/auth/register` each
 * built a new tenant their own way. The seed built the real chart of
 * accounts; register built a shorter, differently-named list that happened
 * to omit every group the posting layer looks up by name — so a
 * self-registered tenant could not record a single payment, receipt or
 * bill. The first thing they tried threw
 * `Ledger group "Cash & Bank" is not configured for this organization`.
 *
 * Both callers now go through `provisionOrganization`, so the two can no
 * longer drift. Everything here is idempotent (upsert on the org-scoped
 * unique keys), which means it is safe to re-run against an existing
 * organization to repair or upgrade it.
 *
 * ── Contract with the posting layer ───────────────────────────────────
 * `src/backend/utils/posting.ts` resolves several ledgers and groups *by
 * name*. Those names are load-bearing: renaming one here breaks posting
 * at runtime, not at compile time. They are marked below.
 */

/** Groups the posting layer requires by name. Do not rename casually. */
export const POSTING_CRITICAL_GROUPS = [
  "Cash & Bank", // getOrCreateBankLedger, getCashLedger
  "Sundry Debtors", // getOrCreatePartyLedger (AR)
  "Sundry Creditors", // getOrCreatePartyLedger (AP)
  "Duties & Taxes", // getTdsPayableLedger, getTcsPayableLedger, GST
] as const;

export const DEFAULT_LEDGER_GROUPS: {
  name: string;
  nature: string;
  parent?: string;
  /**
   * Whether balances in this group are deducted before gross profit.
   *
   * Only Direct Expenses (cost of sales) are. Without this the P&L put
   * purchases below the gross profit line, so a trader buying at 15,000
   * and selling at 70,000 showed a 100% gross margin instead of 78.6%.
   * Net profit was right either way — it is the gross margin, the number
   * a reviewer reads first, that was wrong.
   */
  affectsGrossProfit?: boolean;
}[] = [
  { name: "Assets", nature: "ASSETS" },
  { name: "Current Assets", nature: "ASSETS", parent: "Assets" },
  { name: "Cash & Bank", nature: "ASSETS", parent: "Current Assets" },
  { name: "Sundry Debtors", nature: "ASSETS", parent: "Current Assets" },
  { name: "Stock-in-Hand", nature: "ASSETS", parent: "Current Assets" },
  { name: "Fixed Assets", nature: "ASSETS", parent: "Assets" },
  { name: "Liabilities", nature: "LIABILITIES" },
  { name: "Current Liabilities", nature: "LIABILITIES", parent: "Liabilities" },
  { name: "Sundry Creditors", nature: "LIABILITIES", parent: "Current Liabilities" },
  { name: "Duties & Taxes", nature: "LIABILITIES", parent: "Current Liabilities" },
  { name: "Loans (Liability)", nature: "LIABILITIES", parent: "Liabilities" },
  { name: "Income", nature: "INCOME" },
  { name: "Sales Accounts", nature: "INCOME", parent: "Income" },
  { name: "Other Income", nature: "INCOME", parent: "Income" },
  { name: "Expenses", nature: "EXPENSES" },
  { name: "Direct Expenses", nature: "EXPENSES", parent: "Expenses", affectsGrossProfit: true },
  { name: "Indirect Expenses", nature: "EXPENSES", parent: "Expenses" },
  { name: "Capital Account", nature: "EQUITY" },
];

export const DEFAULT_LEDGERS: { name: string; group: string }[] = [
  { name: "Cash in Hand", group: "Cash & Bank" }, // getCashLedger
  // Contra for balances that exist before the books begin — a bank account
  // opened with money already in it, for instance. Without somewhere to put
  // the other half, an opening balance would leave the trial balance out by
  // its own amount. An accountant reclassifies this to real capital or
  // retained earnings once the opening position is agreed.
  { name: "Opening Balance Equity", group: "Capital Account" },
  { name: "Stock-in-Hand", group: "Stock-in-Hand" }, // manufacturing JV
  { name: "Work in Progress", group: "Stock-in-Hand" }, // manufacturing JV
  { name: "GST Input", group: "Duties & Taxes" }, // postBillToGl
  { name: "GST Output", group: "Duties & Taxes" }, // postInvoiceToGl, RCM
  { name: "TDS Payable", group: "Duties & Taxes" },
  { name: "TCS Payable", group: "Duties & Taxes" },
  { name: "PF Payable", group: "Duties & Taxes" },
  { name: "ESI Payable", group: "Duties & Taxes" },
  { name: "Professional Tax Payable", group: "Duties & Taxes" },
  { name: "Salaries Payable", group: "Current Liabilities" },
  { name: "Sales - Goods", group: "Sales Accounts" }, // postInvoiceToGl
  { name: "Sales - Services", group: "Sales Accounts" },
  { name: "Purchase Accounts", group: "Direct Expenses" }, // postBillToGl
  { name: "Salaries & Wages", group: "Indirect Expenses" },
  { name: "Employer PF Contribution", group: "Indirect Expenses" },
  { name: "Employer ESI Contribution", group: "Indirect Expenses" },
  { name: "Round Off", group: "Indirect Expenses" }, // postInvoiceToGl
  { name: "Rent", group: "Indirect Expenses" },
  { name: "Electricity", group: "Indirect Expenses" },
  { name: "Office Expenses", group: "Indirect Expenses" },
];

/**
 * Indian fiscal year containing `on`: 1 April → 31 March.
 *
 * Dates are constructed in UTC. Building them with `new Date(y, 3, 1)`
 * would anchor to the server's local zone, so a deployment running in
 * UTC+5:30 would store 31 March 18:30Z and quietly push every 1 April
 * voucher into the previous year.
 */
export function fiscalYearBounds(
  on: Date,
  startMonth = 4
): { name: string; startDate: Date; endDate: Date } {
  const year = on.getUTCFullYear();
  const month = on.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return {
    name: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    startDate: new Date(Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(startYear + 1, startMonth - 1, 1, 0, 0, 0, 0) - 1),
  };
}

/**
 * The HR master sets every organization starts with.
 *
 * These three tables were global until migration 17, so a new organization
 * inherited whatever the seed had put there. Now that each org owns its own
 * rows, provisioning has to lay them down — otherwise the first person to open
 * the HR screens finds three empty dropdowns and cannot record an employee or
 * a leave at all.
 *
 * Indian statutory leave sits in here deliberately: maternity leave at 182
 * days is the Maternity Benefit Act entitlement, and Loss of Pay has to exist
 * as a type because payroll's LOP calculation resolves it by code.
 */
const DEFAULT_DEPARTMENTS = [
  "Engineering",
  "Finance",
  "Sales",
  "HR",
  "Operations",
  "Marketing",
];

const DEFAULT_DESIGNATIONS: { name: string; level: number }[] = [
  { name: "Chief Executive Officer", level: 1 },
  { name: "Chief Financial Officer", level: 1 },
  { name: "Director", level: 2 },
  { name: "Manager", level: 3 },
  { name: "Senior Executive", level: 4 },
  { name: "Executive", level: 5 },
  { name: "Trainee", level: 6 },
  { name: "Intern", level: 7 },
];

const DEFAULT_LEAVE_TYPES: {
  name: string;
  code: string;
  annualQuota: number;
  carryForward: boolean;
  maxCarryForward?: number;
  encashable: boolean;
}[] = [
  { name: "Casual Leave", code: "CL", annualQuota: 12, carryForward: false, encashable: false },
  { name: "Sick Leave", code: "SL", annualQuota: 12, carryForward: false, encashable: false },
  {
    name: "Earned Leave",
    code: "EL",
    annualQuota: 15,
    carryForward: true,
    maxCarryForward: 30,
    encashable: true,
  },
  { name: "Maternity Leave", code: "ML", annualQuota: 182, carryForward: false, encashable: false },
  { name: "Paternity Leave", code: "PL", annualQuota: 15, carryForward: false, encashable: false },
  { name: "Loss of Pay", code: "LOP", annualQuota: 0, carryForward: false, encashable: false },
];

export type ProvisionResult = {
  groupIds: Record<string, string>;
  ledgerIds: Record<string, string>;
  fiscalYearId: string;
  branchId: string;
  warehouseId: string;
};

export type ProvisionOptions = {
  organizationId: string;
  /** Defaults to now. Passed explicitly by tests and by back-dated imports. */
  on?: Date;
  /** Fiscal-year start month, 1-12. Defaults to April (India). */
  fiscalYearStartMonth?: number;
  /** Head-office branch name. */
  branchName?: string;
  /** Default warehouse name. */
  warehouseName?: string;
};

/**
 * Bring an organization up to the minimum state the application needs:
 * chart of accounts, default ledgers, a fiscal year covering `on`, a head
 * office branch and a default warehouse.
 *
 * Idempotent — safe to call on an organization that already has some or
 * all of this.
 */
export async function provisionOrganization(
  tx: Tx,
  opts: ProvisionOptions
): Promise<ProvisionResult> {
  const {
    organizationId,
    on = new Date(),
    fiscalYearStartMonth = 4,
    branchName = "Head Office",
    warehouseName = "Main Warehouse",
  } = opts;

  // 1. Ledger groups. Ordered parent-before-child, so the parent id is
  //    always in the map by the time a child needs it.
  const groupIds: Record<string, string> = {};
  for (const group of DEFAULT_LEDGER_GROUPS) {
    const created = await tx.ledgerGroup.upsert({
      where: { organizationId_name: { organizationId, name: group.name } },
      update: {},
      create: {
        organizationId,
        name: group.name,
        nature: group.nature,
        parentId: group.parent ? groupIds[group.parent] ?? null : null,
        affectsGrossProfit: group.affectsGrossProfit ?? false,
        isSystem: true,
      },
      select: { id: true },
    });
    groupIds[group.name] = created.id;
  }

  // 2. Default ledgers.
  const ledgerIds: Record<string, string> = {};
  for (const ledger of DEFAULT_LEDGERS) {
    const groupId = groupIds[ledger.group];
    if (!groupId) {
      // Only reachable if DEFAULT_LEDGERS names a group DEFAULT_LEDGER_GROUPS
      // does not define — a programming error, not a data condition.
      throw new Error(
        `provisionOrganization: ledger "${ledger.name}" references unknown group "${ledger.group}"`
      );
    }
    const created = await tx.ledger.upsert({
      where: { organizationId_name: { organizationId, name: ledger.name } },
      update: {},
      create: { organizationId, name: ledger.name, groupId },
      select: { id: true },
    });
    ledgerIds[ledger.name] = created.id;
  }

  // 3. Fiscal year covering `on`. Without one, getFiscalYearForDate throws
  //    and nothing can be posted.
  const fy = fiscalYearBounds(on, fiscalYearStartMonth);
  const fiscalYear = await tx.fiscalYear.upsert({
    where: { organizationId_name: { organizationId, name: fy.name } },
    update: {},
    create: {
      organizationId,
      name: fy.name,
      startDate: fy.startDate,
      endDate: fy.endDate,
      isClosed: false,
    },
    select: { id: true },
  });

  // 4. Head office branch. Sign-in reads the first active branch to stamp
  //    the session, so an org with none leaves every user branch-less.
  const branch = await tx.branch.upsert({
    where: { organizationId_code: { organizationId, code: "HO" } },
    update: {},
    create: {
      organizationId,
      name: branchName,
      code: "HO",
      isHeadOffice: true,
      isActive: true,
    },
    select: { id: true },
  });

  // 5. Default warehouse, so stock movements have somewhere to land.
  const warehouse = await tx.warehouse.upsert({
    where: { organizationId_name: { organizationId, name: warehouseName } },
    update: {},
    create: {
      organizationId,
      name: warehouseName,
      code: "WH-001",
      branchId: branch.id,
      isDefault: true,
      isActive: true,
    },
    select: { id: true },
  });

  // 6. HR masters. Each org owns its own set since migration 17; without
  //    these the employee and leave forms have nothing to offer.
  for (const name of DEFAULT_DEPARTMENTS) {
    await tx.department.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
  }

  for (const designation of DEFAULT_DESIGNATIONS) {
    await tx.designation.upsert({
      where: { organizationId_name: { organizationId, name: designation.name } },
      update: {},
      create: { organizationId, ...designation },
    });
  }

  for (const leaveType of DEFAULT_LEAVE_TYPES) {
    await tx.leaveType.upsert({
      where: { organizationId_name: { organizationId, name: leaveType.name } },
      update: {},
      create: { organizationId, ...leaveType },
    });
  }

  return {
    groupIds,
    ledgerIds,
    fiscalYearId: fiscalYear.id,
    branchId: branch.id,
    warehouseId: warehouse.id,
  };
}

/**
 * Attach a base currency if the organization has none. Split out from
 * `provisionOrganization` because it needs the global Currency table to
 * already hold the code, which is a seed-level concern.
 */
export async function ensureBaseCurrency(
  tx: Tx,
  organizationId: string,
  code = "INR"
): Promise<string | null> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrencyId: true },
  });
  if (org?.baseCurrencyId) return org.baseCurrencyId;

  const currency = await tx.currency.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!currency) return null;

  await tx.organization.update({
    where: { id: organizationId },
    data: { baseCurrencyId: currency.id },
  });
  return currency.id;
}
