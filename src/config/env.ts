import { z } from "zod";

/**
 * Single source of truth for environment variables.
 *
 * Validated once at module load — missing/malformed env crashes the process
 * at startup with a clear error, instead of failing mysteriously at the first
 * request that needs the variable.
 *
 * Always import env from here, never `process.env.X` directly. The exported
 * `env` object is fully typed and narrowed.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Required at runtime by Prisma client + NextAuth.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid URL"),

  // NextAuth v5 — at least one of AUTH_SECRET / NEXTAUTH_SECRET must exist.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars").optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: z.string().optional(),

  // Operational toggles
  ALLOW_PROD_SEED: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_DEMO: z.enum(["true", "false"]).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
   
  console.error(
    `\n❌ Invalid environment variables:\n${issues}\n\nFix the .env (or your hosting provider's env settings) and try again.\n`
  );
  throw new Error("Invalid environment variables");
}

const data = parsed.data;
if (!data.AUTH_SECRET && !data.NEXTAUTH_SECRET) {
   
  console.error("\n❌ Either AUTH_SECRET or NEXTAUTH_SECRET must be set.\n");
  throw new Error("Missing AUTH_SECRET / NEXTAUTH_SECRET");
}

export const env = {
  ...data,
  AUTH_SECRET: data.AUTH_SECRET ?? data.NEXTAUTH_SECRET!,
  isProduction: data.NODE_ENV === "production",
  isDevelopment: data.NODE_ENV === "development",
  isTest: data.NODE_ENV === "test",
} as const;

export type Env = typeof env;
