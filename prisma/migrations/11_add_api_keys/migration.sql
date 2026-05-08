-- API keys for external programmatic access. Each key is org-scoped; full
-- token shown to creator exactly once at issuance and discarded.
-- The `keyPrefix` column stores the first 12 chars of the visible token
-- for identification + indexed lookup (constant-time fetch before slow
-- comparison). The `keyHash` is SHA-256 hex of the full token.
-- `scopes` is JSON shaped as
--   [{ "module": "<name>", "category": "<name>", "actions": ["read"|"write"|"delete"] }]
-- with `*` wildcards on module/category.
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_keyPrefix_key" ON "api_keys"("keyPrefix");
CREATE INDEX "api_keys_organizationId_isActive_idx" ON "api_keys"("organizationId", "isActive");

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
