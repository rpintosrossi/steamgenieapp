-- CreateTable: sync_operations
-- Append-only log for idempotent offline batch operations.

CREATE TABLE "sync_operations" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"            UUID         NOT NULL,
    "deviceId"          VARCHAR(200) NOT NULL,
    "clientOperationId" VARCHAR(200) NOT NULL,
    "operationType"     VARCHAR(50)  NOT NULL,
    "entityType"        VARCHAR(50)  NOT NULL,
    "entityId"          UUID,
    "payload"           JSONB        NOT NULL,
    "result"            JSONB,
    "status"            VARCHAR(20)  NOT NULL,
    "errorCode"         VARCHAR(100),
    "errorMessage"      TEXT,
    "occurredAt"        TIMESTAMP(3) NOT NULL,
    "processedAt"       TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for idempotency (retry-safe)
CREATE UNIQUE INDEX "sync_operations_clientOperationId_key"
    ON "sync_operations" ("clientOperationId");

-- Index for per-user history queries
CREATE INDEX "sync_operations_userId_createdAt_idx"
    ON "sync_operations" ("userId", "createdAt");

-- Foreign key to users
ALTER TABLE "sync_operations"
    ADD CONSTRAINT "sync_operations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
