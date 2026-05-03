-- BOMs (Bill of Materials)
CREATE TABLE "boms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bomNumber" TEXT NOT NULL,
    "outputQuantity" DECIMAL(18,4) NOT NULL,
    "outputUnitId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "boms_organizationId_bomNumber_key" ON "boms"("organizationId", "bomNumber");
CREATE INDEX "boms_organizationId_itemId_idx" ON "boms"("organizationId", "itemId");
ALTER TABLE "boms" ADD CONSTRAINT "boms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boms" ADD CONSTRAINT "boms_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "boms" ADD CONSTRAINT "boms_outputUnitId_fkey" FOREIGN KEY ("outputUnitId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BOM line items (components)
CREATE TABLE "bom_items" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4),
    "notes" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Work orders
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "completedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scrapQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "warehouseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_orders_organizationId_workOrderNumber_key" ON "work_orders"("organizationId", "workOrderNumber");
CREATE INDEX "work_orders_organizationId_status_idx" ON "work_orders"("organizationId", "status");
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "boms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
