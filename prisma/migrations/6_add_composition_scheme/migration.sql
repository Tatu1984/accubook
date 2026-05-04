-- AlterTable: add Composition Scheme flag + rate to organizations.
ALTER TABLE "organizations" ADD COLUMN "compositionScheme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "compositionRate" DECIMAL(5,2);
