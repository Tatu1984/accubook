-- Bill → GL posting: link bill to its booking voucher + TDS at bill time.
ALTER TABLE "bills" ADD COLUMN "voucherId" TEXT;
ALTER TABLE "bills" ADD COLUMN "tdsSection" TEXT;
ALTER TABLE "bills" ADD COLUMN "tdsRationale" TEXT;
CREATE UNIQUE INDEX "bills_voucherId_key" ON "bills"("voucherId");
ALTER TABLE "bills" ADD CONSTRAINT "bills_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- TdsDeduction: paymentId now nullable, billId added (one of the two).
ALTER TABLE "tds_deductions" DROP CONSTRAINT "tds_deductions_paymentId_fkey";
ALTER TABLE "tds_deductions" ALTER COLUMN "paymentId" DROP NOT NULL;
ALTER TABLE "tds_deductions" ADD COLUMN "billId" TEXT;
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tds_deductions_billId_idx" ON "tds_deductions"("billId");
