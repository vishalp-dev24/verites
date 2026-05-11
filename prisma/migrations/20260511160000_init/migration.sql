-- CreateTable
CREATE TABLE "research_jobs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output_schema" JSONB,
    "cost_controls" JSONB,
    "error_message" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "quality_achieved" BOOLEAN,
    "budget_reached" BOOLEAN,
    "data" JSONB,
    "response" JSONB,
    "sources" JSONB,
    "contradictions" JSONB,
    "follow_up_queries" JSONB,
    "knowledge_gaps" JSONB,
    "worker_failures" JSONB,
    "trace" JSONB,
    "security_events" JSONB,
    "processing_time_ms" INTEGER,
    "processing_time" INTEGER,
    "credits_used" INTEGER,
    "credits_reserved" INTEGER NOT NULL DEFAULT 0,
    "billing_finalized_at" TIMESTAMP(3),
    "reservation_released_at" TIMESTAMP(3),
    "cache_hit" BOOLEAN,
    "iterations" INTEGER DEFAULT 1,
    "worker_lease_id" TEXT,
    "worker_lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "research_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "covers" TEXT NOT NULL,
    "must_not_overlap_with" JSONB[],
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkpoint_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "raw_html" TEXT,
    "extracted_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "topics_researched" JSONB NOT NULL,
    "key_conclusions" JSONB NOT NULL,
    "follow_up_queries" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "name" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY['read','write']::TEXT[],
    "mode_distribution" JSONB,
    "time_pattern" JSONB,
    "query_entropy" DOUBLE PRECISION,
    "cost_curve" JSONB,
    "baseline_established" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "razorpay_customer_id" TEXT,
    "razorpay_subscription_id" TEXT,
    "credits_balance" INTEGER NOT NULL DEFAULT 250,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "max_requests_per_month" INTEGER NOT NULL DEFAULT 3000,
    "max_workers" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_id" TEXT,
    "mode" TEXT NOT NULL,
    "workers_used" INTEGER NOT NULL,
    "iterations" INTEGER NOT NULL,
    "credits_used" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_entries" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metering" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_jobs_job_id_key" ON "research_jobs"("job_id");

-- CreateIndex
CREATE INDEX "research_jobs_tenant_id_idx" ON "research_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "research_jobs_session_id_idx" ON "research_jobs"("session_id");

-- CreateIndex
CREATE INDEX "research_jobs_status_idx" ON "research_jobs"("status");

-- CreateIndex
CREATE INDEX "research_jobs_worker_lease_expires_at_idx" ON "research_jobs"("worker_lease_expires_at");

-- CreateIndex
CREATE INDEX "research_jobs_created_at_idx" ON "research_jobs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_id_key" ON "tasks"("task_id");

-- CreateIndex
CREATE INDEX "tasks_job_id_idx" ON "tasks"("job_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_artifact_id_key" ON "artifacts"("artifact_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_task_id_key" ON "artifacts"("task_id");

-- CreateIndex
CREATE INDEX "artifacts_job_id_idx" ON "artifacts"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tenant_id_session_id_key" ON "sessions"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_idx" ON "sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_id_key" ON "api_keys"("key_id");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_is_active_idx" ON "api_keys"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_id_key" ON "tenants"("tenant_id");

-- CreateIndex
CREATE INDEX "tenants_tier_idx" ON "tenants"("tier");

-- CreateIndex
CREATE INDEX "tenants_is_active_idx" ON "tenants"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_event_id_key" ON "billing_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_job_id_key" ON "billing_events"("job_id");

-- CreateIndex
CREATE INDEX "billing_events_tenant_id_idx" ON "billing_events"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_events_created_at_idx" ON "billing_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cache_entries_fingerprint_key" ON "cache_entries"("fingerprint");

-- CreateIndex
CREATE INDEX "cache_entries_fingerprint_idx" ON "cache_entries"("fingerprint");

-- CreateIndex
CREATE INDEX "cache_entries_expires_at_idx" ON "cache_entries"("expires_at");

-- CreateIndex
CREATE INDEX "metering_tenant_id_idx" ON "metering"("tenant_id");

-- CreateIndex
CREATE INDEX "metering_job_id_idx" ON "metering"("job_id");

-- CreateIndex
CREATE INDEX "metering_timestamp_idx" ON "metering"("timestamp");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "research_jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "research_jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("task_id") ON DELETE CASCADE ON UPDATE CASCADE;
