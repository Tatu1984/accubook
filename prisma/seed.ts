import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hash } from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/accounting_db?schema=public",
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create currencies
  const inr = await prisma.currency.upsert({
    where: { code: "INR" },
    update: {},
    create: {
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      decimalPlaces: 2,
    },
  });

  const usd = await prisma.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      decimalPlaces: 2,
    },
  });

  console.log("Currencies created");

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { id: "admin-role" },
    update: {},
    create: {
      id: "admin-role",
      name: "ADMIN",
      description: "Full access to all features",
      permissions: [
        { module: "*", actions: ["create", "read", "update", "delete", "approve", "export"] },
      ],
      isSystem: true,
    },
  });

  const accountantRole = await prisma.role.upsert({
    where: { id: "accountant-role" },
    update: {},
    create: {
      id: "accountant-role",
      name: "ACCOUNTANT",
      description: "Access to accounting and finance modules",
      permissions: [
        { module: "accounting", actions: ["create", "read", "update", "delete"] },
        { module: "banking", actions: ["create", "read", "update"] },
        { module: "reports", actions: ["read", "export"] },
      ],
      isSystem: true,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { id: "viewer-role" },
    update: {},
    create: {
      id: "viewer-role",
      name: "VIEWER",
      description: "Read-only access",
      permissions: [
        { module: "*", actions: ["read"] },
      ],
      isSystem: true,
    },
  });

  console.log("Roles created");

  // Create units of measure
  const units = [
    { name: "Numbers", symbol: "Nos" },
    { name: "Pieces", symbol: "Pcs" },
    { name: "Kilograms", symbol: "Kg" },
    { name: "Grams", symbol: "g" },
    { name: "Litres", symbol: "Ltr" },
    { name: "Millilitres", symbol: "ml" },
    { name: "Meters", symbol: "Mtr" },
    { name: "Feet", symbol: "Ft" },
    { name: "Square Feet", symbol: "Sqft" },
    { name: "Hours", symbol: "Hr" },
    { name: "Days", symbol: "Day" },
    { name: "Boxes", symbol: "Box" },
    { name: "Cartons", symbol: "Ctn" },
    { name: "Reams", symbol: "Ream" },
    { name: "Dozens", symbol: "Doz" },
  ];

  for (const unit of units) {
    await prisma.unitOfMeasure.upsert({
      where: { name: unit.name },
      update: {},
      create: unit,
    });
  }

  console.log("Units of measure created");

  // Create voucher types
  const voucherTypes = [
    { name: "Payment", code: "PAYMENT", nature: "PAYMENT" },
    { name: "Receipt", code: "RECEIPT", nature: "RECEIPT" },
    { name: "Contra", code: "CONTRA", nature: "CONTRA" },
    { name: "Journal", code: "JOURNAL", nature: "JOURNAL" },
    { name: "Sales", code: "SALES", nature: "SALES" },
    { name: "Purchase", code: "PURCHASE", nature: "PURCHASE" },
    { name: "Debit Note", code: "DEBIT_NOTE", nature: "DEBIT_NOTE" },
    { name: "Credit Note", code: "CREDIT_NOTE", nature: "CREDIT_NOTE" },
  ];

  for (const vt of voucherTypes) {
    await prisma.voucherType.upsert({
      where: { code: vt.code },
      update: {},
      create: {
        ...vt,
        autoNumbering: true,
        numberingPrefix: `${vt.code.substring(0, 3)}/`,
      },
    });
  }

  console.log("Voucher types created");

  // Create leave types
  const leaveTypes = [
    { name: "Casual Leave", code: "CL", annualQuota: 12, carryForward: false, encashable: false },
    { name: "Sick Leave", code: "SL", annualQuota: 12, carryForward: false, encashable: false },
    { name: "Earned Leave", code: "EL", annualQuota: 15, carryForward: true, maxCarryForward: 30, encashable: true },
    { name: "Maternity Leave", code: "ML", annualQuota: 182, carryForward: false, encashable: false },
    { name: "Paternity Leave", code: "PL", annualQuota: 15, carryForward: false, encashable: false },
    { name: "Loss of Pay", code: "LOP", annualQuota: 0, carryForward: false, encashable: false },
  ];

  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { id: lt.code },
      update: {},
      create: {
        id: lt.code,
        ...lt,
      },
    });
  }

  console.log("Leave types created");

  // Create admin user
  const passwordHash = await hash("admin123", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@accubooks.com" },
    update: {},
    create: {
      email: "admin@accubooks.com",
      name: "System Administrator",
      passwordHash,
      isActive: true,
    },
  });

  console.log("Admin user created");

  // Create demo organization
  const organization = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: {
      id: "demo-org",
      name: "Demo Corporation",
      legalName: "Demo Corporation Private Limited",
      email: "contact@democorp.com",
      phone: "+91 22 1234 5678",
      address: "123, Business Park",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IN",
      postalCode: "400001",
      gstNo: "27DEMO12345A1ZA",
      panNo: "DEMO12345A",
      baseCurrencyId: inr.id,
      fiscalYearStart: 4,
    },
  });

  console.log("Demo organization created");

  // Create branch
  const branch = await prisma.branch.upsert({
    where: { id: "demo-branch" },
    update: {},
    create: {
      id: "demo-branch",
      organizationId: organization.id,
      name: "Head Office",
      code: "HO",
      address: "123, Business Park",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IN",
      postalCode: "400001",
      isHeadOffice: true,
    },
  });

  console.log("Demo branch created");

  // Link admin user to organization
  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      roleId: adminRole.id,
      branchIds: [branch.id],
    },
  });

  console.log("Admin linked to organization");

  // Create fiscal year
  const currentYear = new Date().getFullYear();
  const fyStart = new Date(`${currentYear}-04-01`);
  const fyEnd = new Date(`${currentYear + 1}-03-31`);

  await prisma.fiscalYear.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: `${currentYear}-${(currentYear + 1).toString().slice(-2)}`,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: `${currentYear}-${(currentYear + 1).toString().slice(-2)}`,
      startDate: fyStart,
      endDate: fyEnd,
    },
  });

  console.log("Fiscal year created");

  // Create default ledger groups
  const ledgerGroups = [
    { name: "Assets", nature: "ASSETS", isSystem: true },
    { name: "Current Assets", nature: "ASSETS", parent: "Assets", isSystem: true },
    { name: "Cash & Bank", nature: "ASSETS", parent: "Current Assets", isSystem: true },
    { name: "Sundry Debtors", nature: "ASSETS", parent: "Current Assets", isSystem: true },
    { name: "Stock-in-Hand", nature: "ASSETS", parent: "Current Assets", isSystem: true },
    { name: "Fixed Assets", nature: "ASSETS", parent: "Assets", isSystem: true },
    { name: "Liabilities", nature: "LIABILITIES", isSystem: true },
    { name: "Current Liabilities", nature: "LIABILITIES", parent: "Liabilities", isSystem: true },
    { name: "Sundry Creditors", nature: "LIABILITIES", parent: "Current Liabilities", isSystem: true },
    { name: "Duties & Taxes", nature: "LIABILITIES", parent: "Current Liabilities", isSystem: true },
    { name: "Loans (Liability)", nature: "LIABILITIES", parent: "Liabilities", isSystem: true },
    { name: "Income", nature: "INCOME", isSystem: true },
    { name: "Sales Accounts", nature: "INCOME", parent: "Income", isSystem: true },
    { name: "Other Income", nature: "INCOME", parent: "Income", isSystem: true },
    { name: "Expenses", nature: "EXPENSES", isSystem: true },
    { name: "Direct Expenses", nature: "EXPENSES", parent: "Expenses", isSystem: true },
    { name: "Indirect Expenses", nature: "EXPENSES", parent: "Expenses", isSystem: true },
    { name: "Capital Account", nature: "EQUITY", isSystem: true },
  ];

  const groupMap: Record<string, string> = {};

  for (const group of ledgerGroups) {
    const created = await prisma.ledgerGroup.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: group.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: group.name,
        nature: group.nature,
        parentId: group.parent ? groupMap[group.parent] : null,
        isSystem: group.isSystem,
      },
    });
    groupMap[group.name] = created.id;
  }

  console.log("Ledger groups created");

  // Create some default ledgers
  const ledgers = [
    { name: "Cash in Hand", group: "Cash & Bank" },
    { name: "GST Input", group: "Duties & Taxes" },
    { name: "GST Output", group: "Duties & Taxes" },
    { name: "TDS Payable", group: "Duties & Taxes" },
    { name: "Sales - Goods", group: "Sales Accounts" },
    { name: "Sales - Services", group: "Sales Accounts" },
    { name: "Purchase Accounts", group: "Direct Expenses" },
    { name: "Salaries & Wages", group: "Indirect Expenses" },
    { name: "Rent", group: "Indirect Expenses" },
    { name: "Electricity", group: "Indirect Expenses" },
    { name: "Office Expenses", group: "Indirect Expenses" },
  ];

  for (const ledger of ledgers) {
    await prisma.ledger.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: ledger.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: ledger.name,
        groupId: groupMap[ledger.group],
      },
    });
  }

  console.log("Default ledgers created");

  // Create warehouse
  await prisma.warehouse.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Main Warehouse",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      branchId: branch.id,
      name: "Main Warehouse",
      code: "WH001",
      address: "123, Business Park",
      city: "Mumbai",
      state: "Maharashtra",
      isDefault: true,
    },
  });

  console.log("Default warehouse created");

  // Create departments
  const departments = ["Engineering", "Finance", "Sales", "HR", "Operations", "Marketing"];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { id: dept.toLowerCase() },
      update: {},
      create: {
        id: dept.toLowerCase(),
        name: dept,
      },
    });
  }

  console.log("Departments created");

  // Create tax configurations (GST rates)
  const taxConfigs = [
    { name: "GST 0%", code: "GST0", taxType: "GST", rate: 0, description: "Exempt/Nil rated" },
    { name: "GST 5%", code: "GST5", taxType: "GST", rate: 5, description: "Essential items" },
    { name: "GST 12%", code: "GST12", taxType: "GST", rate: 12, description: "Standard rate" },
    { name: "GST 18%", code: "GST18", taxType: "GST", rate: 18, description: "Standard rate" },
    { name: "GST 28%", code: "GST28", taxType: "GST", rate: 28, description: "Luxury items" },
    { name: "IGST 5%", code: "IGST5", taxType: "IGST", rate: 5, description: "Inter-state 5%" },
    { name: "IGST 12%", code: "IGST12", taxType: "IGST", rate: 12, description: "Inter-state 12%" },
    { name: "IGST 18%", code: "IGST18", taxType: "IGST", rate: 18, description: "Inter-state 18%" },
    { name: "IGST 28%", code: "IGST28", taxType: "IGST", rate: 28, description: "Inter-state 28%" },
    { name: "TDS 1%", code: "TDS1", taxType: "TDS", rate: 1, description: "TDS on contractors" },
    { name: "TDS 2%", code: "TDS2", taxType: "TDS", rate: 2, description: "TDS on contractors" },
    { name: "TDS 10%", code: "TDS10", taxType: "TDS", rate: 10, description: "TDS on professional fees" },
  ];

  for (const tax of taxConfigs) {
    await prisma.taxConfig.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: tax.code,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: tax.name,
        code: tax.code,
        taxType: tax.taxType,
        rate: tax.rate,
        description: tax.description,
        isActive: true,
      },
    });
  }

  console.log("Tax configurations created");

  // Create item categories
  const itemCategories = [
    { name: "Goods", description: "Physical goods" },
    { name: "Raw Materials", description: "Raw materials for production", parent: "Goods" },
    { name: "Finished Goods", description: "Finished products for sale", parent: "Goods" },
    { name: "Consumables", description: "Office and factory consumables", parent: "Goods" },
    { name: "Services", description: "Service items" },
    { name: "Professional Services", description: "Consulting, legal, etc.", parent: "Services" },
    { name: "Maintenance Services", description: "AMC, repairs", parent: "Services" },
  ];

  const categoryMap: Record<string, string> = {};

  for (const cat of itemCategories) {
    const created = await prisma.itemCategory.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: cat.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: cat.name,
        description: cat.description,
        parentId: cat.parent ? categoryMap[cat.parent] : null,
      },
    });
    categoryMap[cat.name] = created.id;
  }

  console.log("Item categories created");

  // Create designations
  const designations = [
    { name: "Chief Executive Officer", level: 1 },
    { name: "Chief Financial Officer", level: 1 },
    { name: "Director", level: 2 },
    { name: "Manager", level: 3 },
    { name: "Senior Executive", level: 4 },
    { name: "Executive", level: 5 },
    { name: "Trainee", level: 6 },
    { name: "Intern", level: 7 },
  ];

  for (const desig of designations) {
    await prisma.designation.upsert({
      where: { id: desig.name.toLowerCase().replace(/ /g, "-") },
      update: {},
      create: {
        id: desig.name.toLowerCase().replace(/ /g, "-"),
        name: desig.name,
        level: desig.level,
      },
    });
  }

  console.log("Designations created");

  // Create sample parties (customers & vendors)
  const parties = [
    {
      name: "ABC Traders",
      type: "CUSTOMER",
      email: "abc@traders.com",
      phone: "+91 98765 43210",
      gstNo: "27AABCT1234A1ZA",
      billingAddress: "101, Trade Center",
      billingCity: "Mumbai",
      billingState: "Maharashtra",
      billingCountry: "IN",
      billingPostal: "400001",
    },
    {
      name: "XYZ Enterprises",
      type: "VENDOR",
      email: "xyz@enterprises.com",
      phone: "+91 87654 32109",
      gstNo: "27AADCX5678B1ZB",
      billingAddress: "202, Industrial Area",
      billingCity: "Pune",
      billingState: "Maharashtra",
      billingCountry: "IN",
      billingPostal: "411001",
    },
    {
      name: "Metro Supplies",
      type: "BOTH",
      email: "metro@supplies.com",
      phone: "+91 76543 21098",
      gstNo: "27AABCM9012C1ZC",
      billingAddress: "303, Commerce Hub",
      billingCity: "Thane",
      billingState: "Maharashtra",
      billingCountry: "IN",
      billingPostal: "400601",
    },
    {
      name: "Tech Solutions Pvt Ltd",
      type: "CUSTOMER",
      email: "info@techsolutions.com",
      phone: "+91 65432 10987",
      gstNo: "29AABCT3456D1ZD",
      billingAddress: "404, IT Park",
      billingCity: "Bangalore",
      billingState: "Karnataka",
      billingCountry: "IN",
      billingPostal: "560001",
    },
    {
      name: "Global Parts Inc",
      type: "VENDOR",
      email: "parts@globalparts.com",
      phone: "+91 54321 09876",
      gstNo: "27AABCG7890E1ZE",
      billingAddress: "505, Industrial Estate",
      billingCity: "Mumbai",
      billingState: "Maharashtra",
      billingCountry: "IN",
      billingPostal: "400093",
    },
  ];

  for (const party of parties) {
    await prisma.party.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: party.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        ...party,
      },
    });
  }

  console.log("Sample parties created");

  // Create sample items
  const nosUnit = await prisma.unitOfMeasure.findFirst({ where: { name: "Numbers" } });
  const kgUnit = await prisma.unitOfMeasure.findFirst({ where: { name: "Kilograms" } });
  const hourUnit = await prisma.unitOfMeasure.findFirst({ where: { name: "Hours" } });

  const items = [
    {
      name: "Office Chair",
      sku: "FUR-001",
      type: "GOODS",
      hsnCode: "9401",
      primaryUnitId: nosUnit?.id,
      sellingPrice: 5000,
      purchasePrice: 3500,
    },
    {
      name: "Laptop Stand",
      sku: "ACC-001",
      type: "GOODS",
      hsnCode: "8473",
      primaryUnitId: nosUnit?.id,
      sellingPrice: 1500,
      purchasePrice: 900,
    },
    {
      name: "Printer Paper (A4)",
      sku: "STA-001",
      type: "GOODS",
      hsnCode: "4802",
      primaryUnitId: nosUnit?.id,
      sellingPrice: 350,
      purchasePrice: 280,
    },
    {
      name: "IT Support Service",
      sku: "SVC-001",
      type: "SERVICES",
      sacCode: "998314",
      primaryUnitId: hourUnit?.id,
      sellingPrice: 1500,
    },
    {
      name: "Steel Rods",
      sku: "RAW-001",
      type: "GOODS",
      hsnCode: "7214",
      primaryUnitId: kgUnit?.id,
      sellingPrice: 65,
      purchasePrice: 50,
    },
  ];

  for (const item of items) {
    if (!item.primaryUnitId) continue;
    await prisma.item.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: item.name,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: item.name,
        sku: item.sku,
        type: item.type as "GOODS" | "SERVICE",
        hsnCode: item.hsnCode,
        sacCode: "sacCode" in item ? item.sacCode : undefined,
        primaryUnitId: item.primaryUnitId,
        sellingPrice: item.sellingPrice,
        purchasePrice: item.purchasePrice,
      },
    });
  }

  console.log("Sample items created");

  console.log("\n✅ Database seeding completed!");
  console.log("\n📧 Admin Login:");
  console.log("   Email: admin@accubooks.com");
  console.log("   Password: admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
