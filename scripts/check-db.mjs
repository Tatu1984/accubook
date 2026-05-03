import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const counts = {
  users: await prisma.user.count(),
  organizations: await prisma.organization.count(),
  currencies: await prisma.currency.count(),
  roles: await prisma.role.count(),
};
console.log(JSON.stringify(counts, null, 2));
await prisma.$disconnect();
await pool.end();
