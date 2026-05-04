-- Approval cross-tenant boundary: every Approval must belong to an organization.
-- Existing data (none in production) gets backfilled from the routed entity:
-- vouchers carry organizationId; bills carry organizationId. For other types
-- we fall back to the requester's first OrganizationUser (rare orphans).

ALTER TABLE "approvals" ADD COLUMN "organizationId" TEXT;

-- Backfill: pull organizationId from the routed Voucher / Bill / ExpenseClaim / Leave.
UPDATE "approvals" a
   SET "organizationId" = v."organizationId"
  FROM "vouchers" v
 WHERE a."entityType" = 'VOUCHER' AND v."id" = a."entityId" AND a."organizationId" IS NULL;

UPDATE "approvals" a
   SET "organizationId" = b."organizationId"
  FROM "bills" b
 WHERE a."entityType" = 'BILL' AND b."id" = a."entityId" AND a."organizationId" IS NULL;

UPDATE "approvals" a
   SET "organizationId" = e."organizationId"
  FROM "expense_claims" ec
  JOIN "employees" e ON e."id" = ec."employeeId"
 WHERE a."entityType" = 'EXPENSE_CLAIM' AND ec."id" = a."entityId" AND a."organizationId" IS NULL;

UPDATE "approvals" a
   SET "organizationId" = e."organizationId"
  FROM "leaves" l
  JOIN "employees" e ON e."id" = l."employeeId"
 WHERE a."entityType" = 'LEAVE' AND l."id" = a."entityId" AND a."organizationId" IS NULL;

-- Any remaining unbackfilled rows are orphans (entity deleted) — drop them.
DELETE FROM "approvals" WHERE "organizationId" IS NULL;

-- Now lock the column.
ALTER TABLE "approvals" ALTER COLUMN "organizationId" SET NOT NULL;

-- Indexes — drop the old (entityType, entityId) index, replace with org-scoped versions.
DROP INDEX IF EXISTS "approvals_entityType_entityId_idx";
CREATE INDEX "approvals_organizationId_entityType_entityId_idx"
  ON "approvals"("organizationId", "entityType", "entityId");
CREATE INDEX "approvals_organizationId_approverId_status_idx"
  ON "approvals"("organizationId", "approverId", "status");

-- FK constraint to organizations.
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE;
