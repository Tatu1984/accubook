-- Payment.voucher and Receipt.voucher Prisma relations were added in
-- earlier commits without a backing DB migration; the columns existed
-- (created in 0_init) but no FK constraint pointed at vouchers(id),
-- so a voucher hard-delete could orphan voucherId silently. This
-- migration adds the missing constraints. ON DELETE SET NULL matches
-- the optional Prisma relation.

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
