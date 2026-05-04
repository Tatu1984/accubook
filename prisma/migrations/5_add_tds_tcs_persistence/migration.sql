-- CreateTable
CREATE TABLE "tds_deductions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "deducteeType" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "noPan" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT NOT NULL,
    "deductedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tcs_collections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "deducteeType" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "baseAmount" DECIMAL(18,4) NOT NULL,
    "taxAmount" DECIMAL(18,4) NOT NULL,
    "noPan" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tcs_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tds_deductions_organizationId_fiscalYearId_section_idx" ON "tds_deductions"("organizationId", "fiscalYearId", "section");

-- CreateIndex
CREATE INDEX "tds_deductions_organizationId_partyId_fiscalYearId_idx" ON "tds_deductions"("organizationId", "partyId", "fiscalYearId");

-- CreateIndex
CREATE INDEX "tds_deductions_paymentId_idx" ON "tds_deductions"("paymentId");

-- CreateIndex
CREATE INDEX "tcs_collections_organizationId_fiscalYearId_section_idx" ON "tcs_collections"("organizationId", "fiscalYearId", "section");

-- CreateIndex
CREATE INDEX "tcs_collections_organizationId_partyId_fiscalYearId_idx" ON "tcs_collections"("organizationId", "partyId", "fiscalYearId");

-- CreateIndex
CREATE INDEX "tcs_collections_receiptId_idx" ON "tcs_collections"("receiptId");

-- AddForeignKey
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_deductions" ADD CONSTRAINT "tds_deductions_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tcs_collections" ADD CONSTRAINT "tcs_collections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tcs_collections" ADD CONSTRAINT "tcs_collections_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tcs_collections" ADD CONSTRAINT "tcs_collections_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tcs_collections" ADD CONSTRAINT "tcs_collections_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tcs_collections" ADD CONSTRAINT "tcs_collections_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
