// Prisma config. Always set DATABASE_URL via `.env` (local) or the host's
// project env settings (Vercel/Render/etc.). Build-time prisma commands
// (`migrate deploy`, `generate`) need it during build; runtime needs it via env.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
      "  - Local: copy .env.example to .env and fill it in.\n" +
      "  - Vercel: Settings → Environment Variables → add DATABASE_URL for Production + Preview, then redeploy.\n" +
      "  - CI: define DATABASE_URL in the workflow env block."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
