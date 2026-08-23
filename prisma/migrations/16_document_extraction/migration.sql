-- Documents that arrive as pictures instead of as data: vendor bills
-- photographed on a phone, scans, and PDFs pulled off an email inbox.
--
-- The row is created when the file lands, before anything has been read from
-- it, so a failed extraction still leaves the original on file. `extracted` is
-- a proposal; `postedEntityId` is set only once a human confirms the reading
-- and the Bill or Invoice has actually been created.
--
-- The cost columns are per-document on purpose: extraction is billed by the
-- page, so a price per extraction has to be derived from what each one really
-- cost to read.

CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "sourceRef" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "docType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "direction" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicroUsd" INTEGER,
    "durationMs" INTEGER,
    "extracted" JSONB,
    "confidence" JSONB,
    "reviewed" JSONB,
    "error" TEXT,
    "postedEntityType" TEXT,
    "postedEntityId" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_extractions_organizationId_status_idx" ON "document_extractions"("organizationId", "status");
CREATE INDEX "document_extractions_organizationId_createdAt_idx" ON "document_extractions"("organizationId", "createdAt");

ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
