ALTER TABLE "api_keys"
ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY['read','write']::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "billing_events_job_id_key"
ON "billing_events"("job_id");
