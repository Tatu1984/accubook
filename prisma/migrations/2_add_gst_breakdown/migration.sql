-- Add place-of-supply / supplyType / reverseCharge to invoices and bills
ALTER TABLE "invoices"
  ADD COLUMN "placeOfSupply" TEXT,
  ADD COLUMN "supplyType" TEXT,
  ADD COLUMN "reverseCharge" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "bills"
  ADD COLUMN "placeOfSupply" TEXT,
  ADD COLUMN "supplyType" TEXT,
  ADD COLUMN "reverseCharge" BOOLEAN NOT NULL DEFAULT false;

-- Add CGST / SGST / IGST / CESS rate + amount columns to invoice line items
ALTER TABLE "invoice_items"
  ADD COLUMN "cgstRate" DECIMAL(5, 2),
  ADD COLUMN "cgstAmount" DECIMAL(18, 4),
  ADD COLUMN "sgstRate" DECIMAL(5, 2),
  ADD COLUMN "sgstAmount" DECIMAL(18, 4),
  ADD COLUMN "igstRate" DECIMAL(5, 2),
  ADD COLUMN "igstAmount" DECIMAL(18, 4),
  ADD COLUMN "cessRate" DECIMAL(5, 2),
  ADD COLUMN "cessAmount" DECIMAL(18, 4);

-- Same for bill line items
ALTER TABLE "bill_items"
  ADD COLUMN "cgstRate" DECIMAL(5, 2),
  ADD COLUMN "cgstAmount" DECIMAL(18, 4),
  ADD COLUMN "sgstRate" DECIMAL(5, 2),
  ADD COLUMN "sgstAmount" DECIMAL(18, 4),
  ADD COLUMN "igstRate" DECIMAL(5, 2),
  ADD COLUMN "igstAmount" DECIMAL(18, 4),
  ADD COLUMN "cessRate" DECIMAL(5, 2),
  ADD COLUMN "cessAmount" DECIMAL(18, 4);
