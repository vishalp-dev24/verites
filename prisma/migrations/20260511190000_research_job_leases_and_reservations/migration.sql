ALTER TABLE "research_jobs"
ADD COLUMN IF NOT EXISTS "credits_reserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "billing_finalized_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reservation_released_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "worker_lease_id" TEXT,
ADD COLUMN IF NOT EXISTS "worker_lease_expires_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "research_jobs_worker_lease_expires_at_idx"
ON "research_jobs"("worker_lease_expires_at");
