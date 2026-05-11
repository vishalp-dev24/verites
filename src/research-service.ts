/**
 * Veritas Research Service
 * Core orchestration for multi-source verified research
 * Orchestrates planning, workers, orchestrator loop, and formatting
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from './database/client.js';
import { llmService } from './llm/index.js';
import { workerFleet } from './worker-fleet/executor.js';
import { orchestratorExecutor, OrchestratorConfig } from './orchestrator/index.js';
import { sessionMemoryService } from './session-memory/index.js';
import { billingService } from './billing/index.js';
import { formatter } from './formatter/index.js';
import { securityService } from './security/index.js';
import { logger } from './utils/logger.js';

const WORKER_IDLE_SLEEP_MS = 1000;
const STALE_JOB_MS = 5 * 60 * 1000;
const WORKER_LEASE_MS = 2 * 60 * 1000;

export interface ResearchRequest {
  query: string;
  mode: 'lite' | 'medium' | 'deep';
  sessionId: string;
  outputSchema: any;
  costControls?: {
    maxBudgetPaise?: number;
    fallbackMode?: 'lite' | 'medium' | 'deep';
    qualityThreshold?: number;
    maxIterations?: number;
  };
}

export class ResearchService {
  private workerRunning = false;
  private workerLoopStarted = false;
  private readonly workerId = `worker_${uuidv4().replace(/-/g, '')}`;

  async submit(request: ResearchRequest, context: { tenantId: string; apiKeyId: string }) {
    const jobId = `res_${uuidv4().replace(/-/g, '')}`;

    logger.info('research-service', `Starting research job ${jobId}`, { query: request.query, tenantId: context.tenantId });

    // 2. Pre-research cost estimation
    const costEstimate = await this.estimateCostInternal(request);
    const maxBudget = request.costControls?.maxBudgetPaise ?? costEstimate.max_paise;
    const maxIterations = request.costControls?.maxIterations || 5;

    if (costEstimate.min_paise > maxBudget) {
      logger.warn('research-service', `Cost exceeds budget for job ${jobId}`, {
        min: costEstimate.min_paise,
        max: maxBudget,
      });
      return {
        job_id: jobId,
        status: 'rejected',
        reason: 'estimated_cost_exceeds_budget',
        estimate: costEstimate,
      };
    }

    const enforceBilling = !this.shouldBypassBilling(context);
    const reservedCredits = enforceBilling
      ? this.calculateTotalCredits(
        request.mode,
        Math.max(5, costEstimate.estimated_workers),
        maxIterations
      )
      : 0;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.researchJob.create({
          data: {
            jobId,
            tenantId: context.tenantId,
            sessionId: request.sessionId,
            query: request.query,
            mode: request.mode,
            status: 'queued',
            outputSchema: request.outputSchema as object,
            costControls: request.costControls as object | undefined,
            creditsUsed: 0,
            iterations: 0,
            sources: [],
            contradictions: [],
            followUpQueries: [],
            knowledgeGaps: [],
            workerFailures: [],
            securityEvents: [],
            creditsReserved: reservedCredits,
            data: {
              billing: {
                creditsReserved: reservedCredits,
                enforceBilling,
              },
            },
          },
        });

        if (enforceBilling && reservedCredits > 0) {
          await billingService.reserveCredits({
            jobId,
            tenantId: context.tenantId,
            mode: request.mode,
            workersUsed: Math.max(5, costEstimate.estimated_workers),
            iterations: maxIterations,
            creditsReserved: reservedCredits,
          }, tx);
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Insufficient credits') {
        const creditCheck = await billingService.hasSufficientCredits(context.tenantId, reservedCredits);
        return {
          job_id: jobId,
          status: 'rejected',
          reason: 'insufficient_credits',
          billing: creditCheck,
        };
      }

      throw error;
    }

    return {
      job_id: jobId,
      session_id: request.sessionId,
      mode: request.mode,
      status: 'queued',
      estimated_time: costEstimate.estimated_time_seconds,
      credits_reserved: reservedCredits,
    };
  }

  startWorker(): void {
    if (this.workerLoopStarted || process.env.DISABLE_RESEARCH_WORKER === 'true') return;

    this.workerRunning = true;
    this.workerLoopStarted = true;
    void this.workerLoop()
      .catch((error) => {
        logger.error(
          'research-service',
          'Research worker loop exited unexpectedly',
          error instanceof Error ? error : new Error(String(error))
        );
      })
      .finally(() => {
        this.workerLoopStarted = false;
      });
  }

  stopWorker(): void {
    this.workerRunning = false;
  }

  private async workerLoop(): Promise<void> {
    while (this.workerRunning) {
      try {
        await this.requeueStaleJobs();
        const claim = await this.claimNextQueuedJob();
        if (!claim) {
          await this.sleep(WORKER_IDLE_SLEEP_MS);
          continue;
        }

        await this.executePersistedJob(claim.jobId, claim.leaseId).catch((error) => {
          logger.error(
            'research-service',
            `Persisted research job failed: ${claim.jobId}`,
            error instanceof Error ? error : new Error(String(error))
          );
        });
      } catch (error) {
        logger.error(
          'research-service',
          'Research worker iteration failed',
          error instanceof Error ? error : new Error(String(error))
        );
        await this.sleep(WORKER_IDLE_SLEEP_MS);
      }
    }
  }

  private async requeueStaleJobs(): Promise<void> {
    const staleCutoff = new Date(Date.now() - STALE_JOB_MS);
    const now = new Date();
    const result = await prisma.researchJob.updateMany({
      where: {
        status: { in: ['planning', 'processing', 'finalizing'] },
        OR: [
          { workerLeaseExpiresAt: { lt: now } },
          {
            workerLeaseExpiresAt: null,
            updatedAt: { lt: staleCutoff },
          },
        ],
      },
      data: {
        status: 'queued',
        workerLeaseId: null,
        workerLeaseExpiresAt: null,
      },
    });

    if (result.count > 0) {
      logger.warn('research-service', 'Re-queued stale research jobs', { count: result.count });
    }
  }

  private async claimNextQueuedJob(): Promise<{ jobId: string; leaseId: string } | null> {
    const now = new Date();
    const job = await prisma.researchJob.findFirst({
      where: {
        status: 'queued',
        OR: [
          { workerLeaseExpiresAt: null },
          { workerLeaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { jobId: true, tenantId: true },
    });
    if (!job) return null;

    const leaseId = `${this.workerId}_${uuidv4().replace(/-/g, '')}`;
    const leaseExpiresAt = new Date(Date.now() + WORKER_LEASE_MS);
    const claimed = await prisma.researchJob.updateMany({
      where: {
        jobId: job.jobId,
        tenantId: job.tenantId,
        status: 'queued',
        OR: [
          { workerLeaseExpiresAt: null },
          { workerLeaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'planning',
        workerLeaseId: leaseId,
        workerLeaseExpiresAt: leaseExpiresAt,
      },
    });

    return claimed.count === 1 ? { jobId: job.jobId, leaseId } : null;
  }

  private async executePersistedJob(jobId: string, leaseId: string): Promise<void> {
    const job = await prisma.researchJob.findUnique({
      where: { jobId },
    });
    if (!job || job.status === 'cancelled') return;
    if (job.workerLeaseId !== leaseId || !job.workerLeaseExpiresAt || job.workerLeaseExpiresAt <= new Date()) {
      throw new Error('Job lease lost');
    }

    const jobData = this.asRecord(job.data);
    const billing = this.asRecord(jobData.billing);
    const costControls = this.normalizeCostControls(job.costControls);
    const request: ResearchRequest = {
      query: job.query,
      mode: job.mode as ResearchRequest['mode'],
      sessionId: job.sessionId,
      outputSchema: job.outputSchema ?? {},
      costControls,
    };
    const session = await sessionMemoryService.getSession(job.sessionId, job.tenantId);
    const costEstimate = await this.estimateCostInternal(request);
    const maxIterations = request.costControls?.maxIterations || 5;
    const maxBudget = request.costControls?.maxBudgetPaise ?? costEstimate.max_paise;

    await this.executeJob({
      jobId,
      request,
      context: {
        tenantId: job.tenantId,
        apiKeyId: 'research-worker',
      },
      session,
      reservedCredits: this.asNumber(billing.creditsReserved ?? job.creditsReserved),
      enforceBilling: billing.enforceBilling !== false,
      leaseId,
      startTime: Date.now(),
      maxBudget,
      maxIterations,
      costEstimate,
    });
  }

  private async executeJob(args: {
    jobId: string;
    request: ResearchRequest;
    context: { tenantId: string; apiKeyId: string };
    session: unknown;
    reservedCredits: number;
    enforceBilling: boolean;
    leaseId?: string;
    startTime: number;
    maxBudget: number;
    maxIterations: number;
    costEstimate: { estimated_workers: number };
  }): Promise<void> {
    const {
      jobId,
      request,
      context,
      session,
      reservedCredits,
      enforceBilling,
      leaseId,
      startTime,
      maxBudget,
      maxIterations,
    } = args;
    let reservationFinalized = false;
    const heartbeat = leaseId ? this.startLeaseHeartbeat(jobId, context.tenantId, leaseId) : undefined;

    try {
      await this.ensureNotCancelled(jobId, context.tenantId, leaseId);

      // 3. Planning phase
      await this.updateJobStatus(jobId, context.tenantId, 'planning', leaseId);
      logger.info('research-service', `Planning phase for job ${jobId}`);
      const plan = await llmService.planResearch(request.query, session);

      // 4. Execute initial workers
      logger.info('research-service', `Dispatching ${Math.min(plan.tasks.length, 5)} workers for job ${jobId}`);
      const initialTasks = plan.tasks.slice(0, 5).map((t: any, index: number) => ({
        id: this.makeTaskId(jobId, t.id, index),
        sessionId: request.sessionId,
        topic: t.topic,
        scope: t.scope,
        mustNotOverlap: t.mustNotOverlap || [],
        mode: request.mode,
        tenantId: context.tenantId,
        jobId,
      }));

      await this.ensureNotCancelled(jobId, context.tenantId, leaseId);

      // 5. ORCHESTRATOR DOUBT LOOP
      await this.updateJobStatus(jobId, context.tenantId, 'processing', leaseId);
      logger.info('research-service', `Starting orchestrator loop for job ${jobId}`);
      const orchestratorConfig: OrchestratorConfig = {
        jobId,
        tenantId: context.tenantId,
        sessionId: request.sessionId,
        originalQuery: request.query,
        mode: request.mode,
        qualityThreshold: request.costControls?.qualityThreshold || 0.85,
        maxIterations,
        maxBudgetPaise: maxBudget,
      };

      await workerFleet.dispatchTasks(initialTasks, jobId, context.tenantId);

      await this.ensureNotCancelled(jobId, context.tenantId, leaseId);

      const orchestratorResult = await orchestratorExecutor.run(orchestratorConfig);

      await this.ensureNotCancelled(jobId, context.tenantId, leaseId);

      logger.info('research-service', `Orchestrator complete for job ${jobId}`, {
        iterations: orchestratorResult.iterations,
        confidence: orchestratorResult.confidence,
        qualityAchieved: orchestratorResult.qualityAchieved,
        reDispatched: orchestratorResult.reDispatchedTasks.length,
      });

      // 6. Format output
      logger.info('research-service', `Formatting output for job ${jobId}`);
      const outputSchema = this.asRecord(request.outputSchema);
      const rawOutput = orchestratorResult.findings;
      const formattedData = Object.keys(outputSchema).length > 0
        ? await formatter.format(rawOutput, outputSchema)
        : rawOutput;
      const outputValidation = securityService.validateOutput(formattedData);
      if (!outputValidation.valid) {
        throw new Error('Output failed security validation');
      }
      const safeOutput = outputValidation.sanitized;

      // 7. Calculate and finalize credits
      const creditsUsed = this.calculateTotalCredits(
        request.mode,
        initialTasks.length + orchestratorResult.reDispatchedTasks.length,
        orchestratorResult.iterations
      );

      const finalizingResult = await prisma.researchJob.updateMany({
        where: {
          jobId,
          tenantId: context.tenantId,
          status: { not: 'cancelled' },
          ...(leaseId ? { workerLeaseId: leaseId, workerLeaseExpiresAt: { gt: new Date() } } : {}),
        },
        data: {
          status: 'finalizing',
          ...(leaseId ? { workerLeaseExpiresAt: new Date(Date.now() + WORKER_LEASE_MS) } : {}),
        },
      });

      if (finalizingResult.count !== 1) {
        throw new Error('Job cancelled');
      }

      const knowledgeGaps = orchestratorResult.doubtHistory
        .filter((d: any) => d.severity === 'high' || d.severity === 'critical')
        .map((d: any) => d.topic);

      await prisma.$transaction(async (tx) => {
        if (enforceBilling && reservedCredits > 0) {
          await billingService.finalizeCreditReservation({
            jobId,
            tenantId: context.tenantId,
            mode: request.mode,
            workersUsed: initialTasks.length + orchestratorResult.reDispatchedTasks.length,
            iterations: orchestratorResult.iterations,
            creditsReserved: reservedCredits,
            creditsUsed,
          }, tx);
        }

        const existingJob = await tx.researchJob.findUnique({
          where: { jobId },
          select: { data: true },
        });
        const existingData = this.asRecord(existingJob?.data);

        const updateResult = await tx.researchJob.updateMany({
          where: {
            jobId,
            tenantId: context.tenantId,
            status: 'finalizing',
            ...(leaseId ? { workerLeaseId: leaseId } : {}),
          },
          data: {
            status: orchestratorResult.qualityAchieved ? 'success' : 'partial',
            response: safeOutput as object,
            creditsUsed,
            processingTime: Date.now() - startTime,
            confidenceScore: orchestratorResult.confidence,
            qualityAchieved: orchestratorResult.qualityAchieved,
            budgetReached: orchestratorResult.budgetHit,
            completedAt: new Date(),
            iterations: orchestratorResult.iterations,
            workerLeaseId: null,
            workerLeaseExpiresAt: null,
            data: {
              ...existingData,
              result: safeOutput,
              sources: orchestratorResult.sources,
              contradictions: orchestratorResult.contradictions,
              followUpQueries: (session as any).followUpQueries || [],
              knowledgeGaps,
              workerFailures: [],
            } as object,
            sources: orchestratorResult.sources as object,
            contradictions: orchestratorResult.contradictions as object,
            followUpQueries: (session as any).followUpQueries?.slice(-5) || [],
            knowledgeGaps,
            trace: {
              planning: plan.tasks.length,
              initial_workers: initialTasks.length,
              re_dispatched: orchestratorResult.reDispatchedTasks.length,
              iterations: orchestratorResult.iterations,
              termination: orchestratorResult.terminationReason,
            } as object,
          },
        });

        if (updateResult.count !== 1) {
          throw new Error('Failed to persist research result');
        }
      });

      if (enforceBilling && reservedCredits > 0) {
        reservationFinalized = true;
      }

      logger.info('research-service', `Research job complete: ${jobId}`, { duration: Date.now() - startTime });
    } catch (error) {
      const leaseLost = error instanceof Error && error.message === 'Job lease lost';
      if (enforceBilling && reservedCredits > 0 && !reservationFinalized && !leaseLost) {
        try {
          await billingService.releaseCreditReservationForJob(jobId, context.tenantId, reservedCredits);
        } catch (releaseError) {
          logger.error(
            'research-service',
            `Failed to release credit reservation for job ${jobId}`,
            releaseError instanceof Error ? releaseError : new Error(String(releaseError))
          );
        }
      }

      const cancelled = error instanceof Error && error.message === 'Job cancelled';
      if (!cancelled && !leaseLost) {
        await prisma.researchJob.updateMany({
          where: {
            jobId,
            tenantId: context.tenantId,
            status: { notIn: ['success', 'partial', 'cancelled'] },
            ...(leaseId ? { workerLeaseId: leaseId } : {}),
          },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
            workerLeaseId: null,
            workerLeaseExpiresAt: null,
          },
        });
      }

      throw error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  private async updateJobStatus(jobId: string, tenantId: string, status: string, leaseId?: string): Promise<void> {
    const result = await prisma.researchJob.updateMany({
      where: {
        jobId,
        tenantId,
        status: { not: 'cancelled' },
        ...(leaseId ? { workerLeaseId: leaseId, workerLeaseExpiresAt: { gt: new Date() } } : {}),
      },
      data: {
        status,
        ...(leaseId ? { workerLeaseExpiresAt: new Date(Date.now() + WORKER_LEASE_MS) } : {}),
      },
    });

    if (leaseId && result.count !== 1) {
      throw new Error('Job lease lost');
    }
  }

  private async ensureNotCancelled(jobId: string, tenantId: string, leaseId?: string): Promise<void> {
    const job = await prisma.researchJob.findFirst({
      where: { jobId, tenantId },
      select: { status: true, workerLeaseId: true, workerLeaseExpiresAt: true },
    });

    if (job?.status === 'cancelled') {
      throw new Error('Job cancelled');
    }
    if (leaseId && (job?.workerLeaseId !== leaseId || !job.workerLeaseExpiresAt || job.workerLeaseExpiresAt <= new Date())) {
      throw new Error('Job lease lost');
    }
  }

  private startLeaseHeartbeat(jobId: string, tenantId: string, leaseId: string): NodeJS.Timeout {
    return setInterval(() => {
      void prisma.researchJob.updateMany({
        where: {
          jobId,
          tenantId,
          workerLeaseId: leaseId,
          status: { notIn: ['success', 'partial', 'failed', 'cancelled'] },
        },
        data: {
          workerLeaseExpiresAt: new Date(Date.now() + WORKER_LEASE_MS),
        },
      }).catch((error) => {
        logger.error(
          'research-service',
          `Failed to heartbeat research job lease ${jobId}`,
          error instanceof Error ? error : new Error(String(error))
        );
      });
    }, Math.max(1000, Math.floor(WORKER_LEASE_MS / 3)));
  }

  async estimateCost(query: string, mode: 'lite' | 'medium' | 'deep', sessionId: string) {
    return this.estimateCostInternal({ query, mode, sessionId, outputSchema: {} });
  }

  private async estimateCostInternal(request: Partial<ResearchRequest>) {
    const mode = request.mode || 'medium';
    const baseCost = { lite: 5, medium: 25, deep: 80 }[mode] || 25;

    const queryLength = request.query?.length || 50;
    const estimatedWorkers = Math.min(10, Math.max(2, Math.ceil(queryLength / 30)));

    // Session coherence bonus (cache hits)
    const coherenceBonus = 0.1;

    // Mode-jitter (unpredictability of orchestrator iterations)
    const maxExpectedIterations = 5;

    const minPaise = Math.ceil(baseCost * estimatedWorkers * 100); // ₹0.05-0.80
    const maxPaise = Math.ceil(baseCost * estimatedWorkers * maxExpectedIterations * (1 + coherenceBonus) * 100);

    return {
      min_paise: minPaise,
      max_paise: maxPaise,
      estimated_workers: estimatedWorkers,
      estimated_time_seconds: Math.ceil(estimatedWorkers * 15), // 15s per worker
      estimated_credits: this.calculateTotalCredits(mode, estimatedWorkers, maxExpectedIterations),
    };
  }

  private calculateTotalCredits(mode: string, workers: number, iterations: number): number {
    const base = { lite: 1, medium: 3, deep: 10 }[mode] || 3;
    return Math.ceil(base * workers * Math.max(1, iterations * 0.5));
  }

  private shouldBypassBilling(context: { tenantId: string; apiKeyId: string }): boolean {
    return process.env.ALLOW_ADMIN_BILLING_BYPASS === 'true'
      && process.env.NODE_ENV !== 'production'
      && context.tenantId === 'admin'
      && context.apiKeyId === 'admin-key';
  }

  private makeTaskId(jobId: string, rawId: unknown, index: number): string {
    const normalized = String(rawId || `task_${index + 1}`)
      .replace(/[^A-Za-z0-9._:-]/g, '_')
      .slice(0, 80);
    return `${jobId}_${index + 1}_${normalized}`;
  }

  private normalizeCostControls(value: unknown): ResearchRequest['costControls'] | undefined {
    const record = this.asRecord(value);
    if (Object.keys(record).length === 0) return undefined;

    return {
      maxBudgetPaise: this.asOptionalNumber(record.max_budget_paise ?? record.maxBudgetPaise),
      fallbackMode: this.asMode(record.fallback_mode ?? record.fallbackMode),
      qualityThreshold: this.asOptionalNumber(record.quality_threshold ?? record.qualityThreshold),
      maxIterations: this.asOptionalNumber(record.max_iterations ?? record.maxIterations),
    };
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private asNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private asMode(value: unknown): ResearchRequest['mode'] | undefined {
    return value === 'lite' || value === 'medium' || value === 'deep' ? value : undefined;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cancelJob(jobId: string, tenantId: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.researchJob.updateMany({
        where: {
          jobId,
          tenantId,
          status: { in: ['pending', 'queued', 'planning', 'processing', 'researching', 'running', 'finalizing'] },
        },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          errorMessage: 'Cancelled by tenant',
          workerLeaseId: null,
          workerLeaseExpiresAt: null,
        },
      });

      if (updated.count !== 1) return false;

      const release = await tx.researchJob.updateMany({
        where: {
          jobId,
          tenantId,
          creditsReserved: { gt: 0 },
          billingFinalizedAt: null,
          reservationReleasedAt: null,
        },
        data: {
          reservationReleasedAt: new Date(),
        },
      });

      if (release.count === 1) {
        const job = await tx.researchJob.findUnique({
          where: { jobId },
          select: { creditsReserved: true },
        });
        if (job && job.creditsReserved > 0) {
          await tx.tenant.update({
            where: { tenantId },
            data: {
              creditsBalance: { increment: job.creditsReserved },
            },
          });
        }
      }

      return true;
    });
  }

  /**
   * Get job status by ID
   */
  async getStatus(jobId: string, tenantId: string) {
    const job = await prisma.researchJob.findFirst({
      where: { jobId, tenantId },
    });

    if (!job) return null;

    const jobData = this.asRecord(job.data);
    const finalData = job.response ?? jobData.result ?? job.data;

    return {
      job_id: job.jobId,
      session_id: job.sessionId,
      mode: job.mode as 'lite' | 'medium' | 'deep',
      status: job.status,
      confidence_score: job.confidenceScore,
      quality_achieved: job.qualityAchieved,
      budget_reached: job.budgetReached,
      data: finalData,
      sources: job.sources,
      contradictions: job.contradictions,
      follow_up_queries: job.followUpQueries,
      knowledge_gaps: job.knowledgeGaps,
      credits_used: job.creditsUsed,
      processing_time_ms: job.processingTimeMs ?? job.processingTime,
      created_at: job.createdAt,
      completed_at: job.completedAt,
      error: job.errorMessage,
    };
  }
}

export const researchService = new ResearchService();
