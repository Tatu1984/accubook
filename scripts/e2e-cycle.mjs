/**
 * End-to-end accounting cycle against a disposable database.
 *
 * Why this exists: every serious defect found in review passed the unit
 * suite. The balance sheet reported zero assets, a payroll voucher posted
 * with debits 1,800 above credits, invoice creation refused most
 * customers, and gross profit excluded cost of sales — all with 525 unit
 * tests green, because nothing exercised the routes against posted books.
 *
 * So this drives the real HTTP API, through real auth, against a real
 * schema, and asserts the invariants an accountant would check.
 *
 *   npm run test:e2e
 *
 * It creates its own database, migrates, seeds, starts the app on a spare
 * port, runs the cycle, then drops everything. It never touches .env — the
 * database URL is passed to the child process explicitly, so it cannot
 * reach production even if .env points there.
 *
 * Requires a local PostgreSQL. Exits non-zero on the first broken
 * invariant, so it is usable as a gate in CI.
 */
import { execSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const DB = process.env.E2E_DB_NAME || "accubook_e2e";
const PORT = Number(process.env.E2E_PORT || 3117);
const BASE = `http://localhost:${PORT}`;
const ORG = "demo-org";
const API = `${BASE}/api/organizations/${ORG}`;
const DB_URL = `postgresql://${process.env.USER}@localhost:5432/${DB}?schema=public`;

let passed = 0;
const failures = [];
const ok = (label, detail = "") => { passed++; console.log(`  ok   ${label}${detail ? "  " + detail : ""}`); };
const bad = (label, detail = "") => { failures.push(`${label} — ${detail}`); console.log(`  FAIL ${label}\n       ${detail}`); };
const check = (cond, label, detail = "") => (cond ? ok(label, cond === true ? detail : "") : bad(label, detail));
const near = (a, b, t = 0.02) => Math.abs(Number(a || 0) - Number(b || 0)) <= t;
const money = (v) => Number(v || 0).toFixed(2);

const sh = (cmd, env = {}) =>
  execSync(cmd, { stdio: "pipe", env: { ...process.env, ...env } }).toString();

let server;
let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed };
}
const GET = (p) => api("GET", p);
const POST = (p, b) => api("POST", p, b);
const list = (r) => (Array.isArray(r.body) ? r.body : r.body?.data ?? []);

async function setup() {
  console.log(`\nBuilding a throwaway database (${DB})…`);
  sh(`psql -d postgres -c "DROP DATABASE IF EXISTS ${DB};"`);
  sh(`psql -d postgres -c "CREATE DATABASE ${DB};"`);
  sh("npx prisma migrate deploy", { DATABASE_URL: DB_URL });
  sh("npx tsx prisma/seed.ts", { DATABASE_URL: DB_URL, ALLOW_PROD_SEED: "true" });
  sh(
    `psql -d ${DB} -c "update organizations set name='E2E', \\"gstNo\\"='27AAAAA0000A1Z5', ` +
      `address='Plot 12', city='Pune', state='Maharashtra', \\"postalCode\\"='411019', country='IN';"`
  );

  console.log(`Starting the app on ${PORT}…`);
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    // DATABASE_URL is set here rather than in a file, so nothing this
    // process does can be pointed at the real database by accident.
    env: { ...process.env, DATABASE_URL: DB_URL, NEXTAUTH_URL: BASE, APP_URL: BASE, NEXT_PUBLIC_DEMO: "false" },
    stdio: "ignore",
  });

  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await sleep(1000);
  }

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const setCsrf = csrfRes.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await csrfRes.json();
  const form = new URLSearchParams({
    csrfToken,
    email: "admin@accubook.com",
    password: "password123!",
    callbackUrl: `${BASE}/dashboard`,
  });
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: setCsrf.map((c) => c.split(";")[0]).join("; "),
    },
    body: form,
    redirect: "manual",
  });
  cookie = [...setCsrf, ...(login.headers.getSetCookie?.() ?? [])]
    .map((c) => c.split(";")[0])
    .join("; ");

  const session = await (await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie } })).json();
  if (session?.user?.organizationName !== "E2E") {
    throw new Error(
      `Refusing to continue: the app reports organization ` +
        `"${session?.user?.organizationName}" instead of the throwaway "E2E". ` +
        `It may be pointed at another database.`
    );
  }
  console.log("Signed in against the throwaway database.\n");
}

function teardown() {
  server?.kill();
  try { sh(`psql -d postgres -c "DROP DATABASE IF EXISTS ${DB};"`); } catch { /* best effort */ }
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const later = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const unitId = (await (await fetch(`${BASE}/api/units`, { headers: { Cookie: cookie } })).json())[0].id;
  const gst18 = list(await GET("/tax-config")).find((t) => t.name === "GST 18%");
  const whId = list(await GET("/warehouses"))[0].id;

  console.log("Masters");
  const made = {};
  for (const [key, path, payload] of [
    ["mh", "/parties", { name: "E2E Local", type: "CUSTOMER", gstNo: "27AAECE1111F1Z0",
      billingAddress: "45 MG Road", billingCity: "Pune", billingState: "Maharashtra",
      billingPostal: "411001", billingCountry: "IN" }],
    ["ka", "/parties", { name: "E2E Interstate", type: "CUSTOMER", gstNo: "29AAECE2222G1Z0",
      billingAddress: "1 Residency", billingCity: "Bengaluru", billingState: "Karnataka",
      billingPostal: "560001", billingCountry: "IN" }],
    ["vendor", "/parties", { name: "E2E Vendor", type: "VENDOR", gstNo: "27AAECE3333H1Z0",
      billingAddress: "Estate", billingCity: "Mumbai", billingState: "Maharashtra",
      billingPostal: "400001", billingCountry: "IN" }],
    ["item", "/items", { name: "E2E Widget", sku: "E2E-W", primaryUnitId: unitId,
      type: "GOODS", purchasePrice: 300, sellingPrice: 1200, hsnCode: "9403",
      salesTaxId: gst18.id, purchaseTaxId: gst18.id }],
  ]) {
    const res = await POST(path, payload);
    made[key] = res.body;
    // Reported per master, so a failure names which one and why rather
    // than collapsing into an unexplained "masters created" failure.
    check(res.status === 201 && !!res.body?.id, `master created: ${payload.name}`,
      `HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  const { mh, ka, vendor, item } = made;

  console.log("\nBank");
  const bank = await POST("/bank-accounts", { name: "E2E Current", bankName: "HDFC",
    accountNumber: "5020001", ifscCode: "HDFC0001234", accountType: "CURRENT", openingBalance: 500000 });
  check(bank.ok, "bank account opens", JSON.stringify(bank.body).slice(0, 160));

  console.log("\nSales");
  // The null here is the shape that used to reject most customers.
  const inv = await POST("/invoices", { partyId: mh.id, date: today, dueDate: later, status: "SENT",
    shippingAddress: null,
    items: [{ itemId: item.id, description: "Widget", quantity: 50, unitPrice: 1200, taxId: gst18.id, taxAmount: 0 }] });
  check(inv.status === 201, "invoice accepts null optional fields", JSON.stringify(inv.body).slice(0, 200));
  const I = inv.body;
  check(near(I.items?.[0]?.cgstAmount, 5400) && near(I.items?.[0]?.sgstAmount, 5400),
    "intra-state splits CGST 5,400 + SGST 5,400",
    `cgst ${money(I.items?.[0]?.cgstAmount)} sgst ${money(I.items?.[0]?.sgstAmount)}`);
  check(I.items?.[0]?.hsnCode === "9403", "line inherits HSN from the item master", `got ${I.items?.[0]?.hsnCode}`);
  check(!!I.voucherId, "issued invoice is linked to its voucher");

  const inter = await POST("/invoices", { partyId: ka.id, date: today, dueDate: later, status: "SENT",
    items: [{ itemId: item.id, description: "Widget", quantity: 10, unitPrice: 1200, taxId: gst18.id, taxAmount: 0 }] });
  check(near(inter.body?.items?.[0]?.igstAmount, 2160) && near(inter.body?.items?.[0]?.cgstAmount, 0),
    "inter-state charges IGST only", `igst ${money(inter.body?.items?.[0]?.igstAmount)}`);

  const rcpt = await POST("/receipts", { partyId: mh.id, invoiceId: I.id, date: today,
    amount: 70800, paymentMode: "BANK_TRANSFER", bankAccountId: bank.body.id });
  check(rcpt.status === 201, "receipt recorded", JSON.stringify(rcpt.body).slice(0, 160));
  const settled = (await GET(`/invoices/${I.id}`)).body;
  check(settled.status === "PAID" && near(settled.amountDue, 0), "invoice settles to PAID",
    `status ${settled.status} due ${money(settled.amountDue)}`);
  const over = await POST("/receipts", { partyId: mh.id, invoiceId: I.id, date: today,
    amount: 1000, paymentMode: "BANK_TRANSFER", bankAccountId: bank.body.id });
  check(over.status >= 400, "over-collection is refused", `HTTP ${over.status}`);

  console.log("\nPurchases and stock");
  const bill = await POST("/bills", { partyId: vendor.id, date: today, dueDate: later, status: "APPROVED",
    items: [{ itemId: item.id, quantity: 100, unitPrice: 300, taxId: gst18.id }] });
  check(bill.status === 201 && !!bill.body.voucherId, "approved bill posts to the ledger");
  check((await GET(`/bills/${bill.body.id}`)).status === 200, "a single bill can be read back");
  const noWh = await POST("/stock", { itemId: item.id, movementType: "GRN", quantity: 10, rate: 300,
    unitId, date: today });
  check(noWh.status >= 400, "stock movement without a warehouse is refused", `HTTP ${noWh.status}`);
  const grn = await POST("/stock", { itemId: item.id, movementType: "GRN", quantity: 100, rate: 300,
    toWarehouseId: whId, unitId, date: today });
  check(grn.status === 201, "goods receipt into stores", JSON.stringify(grn.body).slice(0, 120));

  console.log("\nPayroll");
  const emp = await POST("/employees", { employeeCode: "E2E-1", firstName: "Test", lastName: "Employee",
    joiningDate: today, employmentType: "FULL_TIME", ctc: 600000 });
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  // "PF" rather than "PF (Employee)" is the spelling that produced an
  // unbalanced voucher.
  await POST("/payroll", { employeeId: emp.body.id, month: m, year: y, basicSalary: 25000,
    earnings: [{ name: "HRA", amount: 10000 }], deductions: [{ name: "PF", amount: 1800 }],
    workingDays: 30, presentDays: 30, lopDays: 0 });
  const post = await POST("/payroll/post-month", { month: m, year: y });
  check(post.ok && near(post.body.totalDebit, post.body.totalCredit),
    "payroll journal balances",
    `Dr ${money(post.body?.totalDebit)} Cr ${money(post.body?.totalCredit)} ${JSON.stringify(post.body).slice(0, 120)}`);

  console.log("\nThe books");
  const vouchers = list(await GET("/vouchers?limit=200"));
  const unbalanced = vouchers.filter((v) => !near(v.totalDebit, v.totalCredit));
  check(unbalanced.length === 0, "every voucher balances",
    unbalanced.map((v) => `${v.voucherNumber} Dr ${money(v.totalDebit)} Cr ${money(v.totalCredit)}`).join("; "));

  // Far enough out to include month-end dated journals, which is how the
  // unbalanced payroll voucher stayed hidden.
  for (const asOf of [today, `${y + 1}-03-31`]) {
    const tb = await GET(`/reports/trial-balance?startDate=2000-01-01&endDate=${asOf}&asOfDate=${asOf}`);
    const rows = tb.body?.items ?? [];
    const dr = rows.reduce((t, i) => t + Number(i.closingDebit || 0), 0);
    const cr = rows.reduce((t, i) => t + Number(i.closingCredit || 0), 0);
    check(near(dr, cr) && dr > 0, `trial balance agrees as at ${asOf}`,
      `Dr ${money(dr)} vs Cr ${money(cr)}`);
  }

  const bs = (await GET("/reports/balance-sheet?startDate=2000-01-01&endDate=2100-01-01")).body?.summary ?? {};
  check(bs.isBalanced === true, "balance sheet balances",
    `A ${money(bs.totalAssets)} vs L+E ${money(bs.totalLiabilitiesAndEquity)}`);
  // Reporting zero while the trial balance agreed was the original defect,
  // so a balanced-but-empty statement must not pass.
  check(Number(bs.totalAssets) > 0, "balance sheet reports assets", `totalAssets ${money(bs.totalAssets)}`);

  const pl = (await GET("/reports/profit-loss?startDate=2000-01-01&endDate=2100-01-01")).body;
  check(Number(pl?.directExpenses?.total) > 0, "cost of sales sits above the gross profit line",
    `directExpenses ${money(pl?.directExpenses?.total)}`);
  check(Number(pl?.grossProfit?.amount) < Number(pl?.income?.total), "gross profit is net of cost of sales",
    `gross ${money(pl?.grossProfit?.amount)} vs revenue ${money(pl?.income?.total)}`);

  // The bank register and the ledger disagreeing by the opening balance is
  // what made reconciliation impossible.
  const acct = list(await GET("/bank-accounts")).find((a) => a.id === bank.body.id);
  const tbAll = await GET("/reports/trial-balance?startDate=2000-01-01&endDate=2100-01-01");
  const bankRow = (tbAll.body?.items ?? []).find((i) => i.ledgerName === "E2E Current");
  const ledgerBal = Number(bankRow?.closingDebit || 0) - Number(bankRow?.closingCredit || 0);
  check(near(acct?.currentBalance, ledgerBal), "bank register agrees with the ledger",
    `register ${money(acct?.currentBalance)} vs ledger ${money(ledgerBal)}`);

  const einv = await GET(`/invoices/${I.id}/einvoice-payload`);
  check(einv.status === 200, "e-invoice payload generates", JSON.stringify(einv.body).slice(0, 200));
}

try {
  await setup();
  await run();
} catch (e) {
  bad("harness", e.message);
} finally {
  teardown();
}

console.log(`\n${"=".repeat(60)}`);
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nBroken invariants:");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log("=".repeat(60));
process.exit(failures.length ? 1 : 0);
