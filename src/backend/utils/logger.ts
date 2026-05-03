import pino from "pino";
import { env } from "@/config/env";

/**
 * Structured logger.
 *
 * - In production: JSON logs to stdout (Vercel ingests these directly).
 * - In development: pretty-printed if `pino-pretty` is installed, else JSON.
 *
 * Sensitive paths are redacted. Always use `logger.error({ err, ...ctx }, msg)`
 * — passing raw error objects directly avoids leaking stack traces in fields
 * we forgot to redact.
 *
 * Replace `console.error(...)` in API routes with `logger.error(...)`.
 */
export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  base: { service: "accubook" },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "headers.authorization",
      "headers.cookie",
      "*.headers.authorization",
      "*.headers.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.AUTH_SECRET",
      "*.NEXTAUTH_SECRET",
      "*.DATABASE_URL",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
