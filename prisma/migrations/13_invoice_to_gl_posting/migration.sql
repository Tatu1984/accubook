-- Links a sales invoice to the SALES voucher that booked it to the
-- general ledger.
--
-- Invoices previously had no ledger effect at all: revenue never reached
-- the P&L, receivables never reached the balance sheet, and output GST was
-- never booked as a liability — while the purchase side (Bill.voucherId,
-- migration 8) posted correctly. This is the sales-side mirror, and follows
-- migration 8's shape exactly.
--
-- Nullable: an invoice in DRAFT has no accounting effect and no voucher.
-- Unique: one invoice books exactly one voucher; re-posting is refused in
-- application code and impossible at the database level.
ALTER TABLE "invoices" ADD COLUMN "voucherId" TEXT;

CREATE UNIQUE INDEX "invoices_voucherId_key" ON "invoices"("voucherId");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
