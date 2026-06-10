-- Add metadata fields to task_photos
-- originalFilename: preserve user-visible filename for display purposes
-- mimeType: validated MIME type of the uploaded file
-- deviceId: device that captured/uploaded the photo (offline tracking)
-- clientOperationId: idempotency key for offline sync

ALTER TABLE "task_photos"
  ADD COLUMN IF NOT EXISTS "originalFilename" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "mimeType"         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "deviceId"         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "clientOperationId" VARCHAR(100);

-- Unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "task_photos_clientOperationId_key"
  ON "task_photos" ("clientOperationId");

-- Update default storageBucket from "steam-genie" to "local" (local fallback)
ALTER TABLE "task_photos"
  ALTER COLUMN "storageBucket" SET DEFAULT 'local';
