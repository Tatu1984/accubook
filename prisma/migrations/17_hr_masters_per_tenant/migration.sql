-- Give departments, designations and leave types an owner.
--
-- These three tables had no `organizationId`. They were global: one row set
-- shared by every tenant, which is why `leave_types` was read with no scoping
-- at all and `departments` was read through a workaround
-- (`employees: { some: { organizationId } }` OR'd with `employees: { none: {} }`)
-- that leaked any department nobody had been assigned to yet into every other
-- tenant's list.
--
-- The move is a clone, not a re-label. Handing each shared row to whichever
-- organization happened to touch it first would take those departments away
-- from everyone else who is already using them. Instead every organization
-- gets its own copy of the set, employees are re-pointed at their own
-- organization's copy, and the shared originals are dropped once nothing
-- references them.
--
-- Rows are de-duplicated by lower(name) on the way through, because the new
-- unique constraints would otherwise reject a set that was previously legal.
-- Anything more pathological than a repeated name — two different names
-- sharing a code, say — trips the unique constraint and aborts the migration
-- rather than silently picking a winner. Failing here is recoverable; a
-- silently mismatched HR master set is not.

-- ---------------------------------------------------------------- departments

ALTER TABLE "departments" ADD COLUMN "organizationId" TEXT;

CREATE TEMP TABLE "dept_map" ON COMMIT DROP AS
SELECT
  o."id"                     AS org_id,
  lower(d."name")            AS lname,
  gen_random_uuid()::text    AS new_id,
  min(d."id")                AS src_id
FROM "departments" d
CROSS JOIN "organizations" o
WHERE d."organizationId" IS NULL
GROUP BY o."id", lower(d."name");

INSERT INTO "departments" (
  "id", "organizationId", "name", "code", "description",
  "headId", "isActive", "createdAt", "updatedAt"
)
SELECT
  m.new_id, m.org_id, d."name", d."code", d."description",
  d."headId", d."isActive", d."createdAt", NOW()
FROM "dept_map" m
JOIN "departments" d ON d."id" = m.src_id;

UPDATE "employees" e
SET "departmentId" = m.new_id
FROM "departments" d
JOIN "dept_map" m ON lower(d."name") = m.lname
WHERE e."departmentId" = d."id"
  AND e."organizationId" = m.org_id
  AND d."organizationId" IS NULL;

DELETE FROM "departments" WHERE "organizationId" IS NULL;

ALTER TABLE "departments" ALTER COLUMN "organizationId" SET NOT NULL;

-- --------------------------------------------------------------- designations

ALTER TABLE "designations" ADD COLUMN "organizationId" TEXT;

CREATE TEMP TABLE "desig_map" ON COMMIT DROP AS
SELECT
  o."id"                     AS org_id,
  lower(g."name")            AS lname,
  gen_random_uuid()::text    AS new_id,
  min(g."id")                AS src_id
FROM "designations" g
CROSS JOIN "organizations" o
WHERE g."organizationId" IS NULL
GROUP BY o."id", lower(g."name");

INSERT INTO "designations" (
  "id", "organizationId", "name", "level", "description",
  "isActive", "createdAt", "updatedAt"
)
SELECT
  m.new_id, m.org_id, g."name", g."level", g."description",
  g."isActive", g."createdAt", NOW()
FROM "desig_map" m
JOIN "designations" g ON g."id" = m.src_id;

UPDATE "employees" e
SET "designationId" = m.new_id
FROM "designations" g
JOIN "desig_map" m ON lower(g."name") = m.lname
WHERE e."designationId" = g."id"
  AND e."organizationId" = m.org_id
  AND g."organizationId" IS NULL;

DELETE FROM "designations" WHERE "organizationId" IS NULL;

ALTER TABLE "designations" ALTER COLUMN "organizationId" SET NOT NULL;

-- ---------------------------------------------------------------- leave_types

ALTER TABLE "leave_types" ADD COLUMN "organizationId" TEXT;

CREATE TEMP TABLE "lt_map" ON COMMIT DROP AS
SELECT
  o."id"                     AS org_id,
  lower(l."name")            AS lname,
  gen_random_uuid()::text    AS new_id,
  min(l."id")                AS src_id
FROM "leave_types" l
CROSS JOIN "organizations" o
WHERE l."organizationId" IS NULL
GROUP BY o."id", lower(l."name");

INSERT INTO "leave_types" (
  "id", "organizationId", "name", "code", "annualQuota", "carryForward",
  "maxCarryForward", "encashable", "isActive", "createdAt", "updatedAt"
)
SELECT
  m.new_id, m.org_id, l."name", l."code", l."annualQuota", l."carryForward",
  l."maxCarryForward", l."encashable", l."isActive", l."createdAt", NOW()
FROM "lt_map" m
JOIN "leave_types" l ON l."id" = m.src_id;

-- Leave has no organizationId of its own; it reaches one through its employee.
-- `e` is comma-joined rather than JOIN-ed: the correlation is to `lv`, the
-- UPDATE target, which Postgres does not expose to a JOIN condition in FROM.
UPDATE "leaves" lv
SET "leaveTypeId" = m.new_id
FROM "leave_types" l
JOIN "lt_map" m ON lower(l."name") = m.lname,
     "employees" e
WHERE lv."leaveTypeId" = l."id"
  AND e."id" = lv."employeeId"
  AND e."organizationId" = m.org_id
  AND l."organizationId" IS NULL;

DELETE FROM "leave_types" WHERE "organizationId" IS NULL;

ALTER TABLE "leave_types" ALTER COLUMN "organizationId" SET NOT NULL;

-- ------------------------------------------------------- constraints & indexes

CREATE UNIQUE INDEX "departments_organizationId_name_key"
  ON "departments" ("organizationId", "name");
CREATE UNIQUE INDEX "departments_organizationId_code_key"
  ON "departments" ("organizationId", "code");
CREATE INDEX "departments_organizationId_idx"
  ON "departments" ("organizationId");

CREATE UNIQUE INDEX "designations_organizationId_name_key"
  ON "designations" ("organizationId", "name");
CREATE INDEX "designations_organizationId_idx"
  ON "designations" ("organizationId");

CREATE UNIQUE INDEX "leave_types_organizationId_name_key"
  ON "leave_types" ("organizationId", "name");
CREATE UNIQUE INDEX "leave_types_organizationId_code_key"
  ON "leave_types" ("organizationId", "code");
CREATE INDEX "leave_types_organizationId_idx"
  ON "leave_types" ("organizationId");

ALTER TABLE "departments"
  ADD CONSTRAINT "departments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "designations"
  ADD CONSTRAINT "designations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leave_types"
  ADD CONSTRAINT "leave_types_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
