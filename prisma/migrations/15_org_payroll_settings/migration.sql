-- Payroll configuration for the HR module.
--
-- The Payroll → Settings tab (EPF establishment code and wage ceiling, ESI
-- code, TAN, default tax regime, statutory component toggles) had no column
-- to write to, so its "Save Payroll Settings" button could not persist
-- anything. Stored as JSON: it is a settings sheet, never joined or filtered
-- on, and the shape is validated by zod at the API boundary.

ALTER TABLE "organizations" ADD COLUMN "payrollSettings" JSONB;
