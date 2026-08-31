-- CreateTable
CREATE TABLE "quote_internal_photos" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "storageKey" VARCHAR(500) NOT NULL,
    "storageBucket" VARCHAR(100) NOT NULL DEFAULT 'local',
    "originalFilename" VARCHAR(500),
    "mimeType" VARCHAR(100),
    "fileSizeBytes" INTEGER,
    "uploadedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_internal_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_internal_photos_quoteId_deletedAt_createdAt_idx" ON "quote_internal_photos"("quoteId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "quote_internal_photos" ADD CONSTRAINT "quote_internal_photos_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_internal_photos" ADD CONSTRAINT "quote_internal_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
