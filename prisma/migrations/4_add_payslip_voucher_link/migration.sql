-- AlterTable
ALTER TABLE "payslips" ADD COLUMN "voucherId" TEXT;

-- CreateIndex
CREATE INDEX "payslips_voucherId_idx" ON "payslips"("voucherId");

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
