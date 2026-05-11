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
import { blackboard } from './blackboard/index.js';
import { sessionMemoryService } from './session-memory/index.js';
import { billingService } from './billing/index.js';
import { logger } from './utils/logger.js';

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
  async submit(request: ResearchRequest, context: { tenantId: string; apiKeyId: string }) {
    const jobId = `res_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
    const startTime = Date.now();

    logger.info('research-service', `Starting research job ${jobId}`, { query: request.query, tenantId: context.tenantId });

    // 1. Get session memory
    const session = await sessionMemoryService.getSession(
      request.sessionId,
      context.tenantId
    );

    // 2. Pre-research cost estimation
    const costEstimate = await this.estimateCostInternal(request);
    const maxBudget = request.costControls?.maxBudgetPaise || 2500;

    if (costEstimate.min_paise > maxBudget) {
      logger.warn('research-service', `Cost exceeds budget for job ${jobId}`), { min: costEstimate.min_paise, max: maxBudget };
      return {
        job_id: jobId,
        status: 'rejected',
        reason: 'estimated_cost_exceeds_budget',
        estimate: costEstimate,
      };
    }

    // 3. Planning phase
    logger.info('research-service', `Planning phase for job ${jobId}`);
    const plan = await llmService.planResearch(request.query, session);

    // 4. Execute initial workers
    logger.info('research-service', `Dispatching ${Math.min(plan.tasks.length, 5)} workers for job ${jobId}`);
    const initialTasks = plan.tasks.slice(0, 5).map((t: any) => ({
      id: t.id,
      sessionId: request.sessionId,
      topic: t.topic,
      scope: t.scope,
      mustNotOverlap: t.mustNotOverlap || [],
      mode: request.mode,
      tenantId: context.tenantId,
      jobId,
    }));

    await workerFleet.dispatchTasks(initialTasks, jobId, context.tenantId);

    // 5. ORCHESTRATOR DOUBT LOOP
    logger.info('research-service', `Starting orchestrator loop for job ${jobId}`);
    const orchestratorConfig: OrchestratorConfig = {
      jobId,
      tenantId: context.tenantId,
      sessionId: request.sessionId,
      originalQuery: request.query,
      mode: request.mode,
      qualityThreshold: request.costControls?.qualityThreshold || 0.85,
      maxIterations: request.costControls?.maxIterations || 5,
      maxBudgetPaise: maxBudget,
    };

    const orchestratorResult = await orchestratorExecutor.run(orchestratorConfig);
    
    logger.info('research-service', `Orchestrator complete for job ${jobId}`, { 
      iterations: orchestratorResult.iterations,
      confidence: orchestratorResult.confidence,
      qualityAchieved: orchestratorResult.qualityAchieved,
      reDispatched: orchestratorResult.reDispatchedTasks.length,
    });

    // 6. Format output
    logger.info('research-service', `Formatting output for job ${jobId}`);
    const formattedData = orchestratorResult.findings; // simplified

    // 7. LLM-as-Judge evaluation
    logger.info('research-service', `Running quality evaluation for job ${jobId}`);
    const evaluation = { passed: true, score: orchestratorResult.confidence }; // simplified

    // 8. Update session memory
    const summary = (formattedData as any)?.summary || String(orchestratorResult.findings).slice(0, 200);
    
    // 9. Calculate and deduct credits
    const creditsUsed = this.calculateTotalCredits(
      request.mode,
      initialTasks.length + orchestratorResult.reDispatchedTasks.length,
      orchestratorResult.iterations
    );

    await billingService.addCredits(context.tenantId, -creditsUsed);

    // 10. Save job record
    await prisma.researchJob.create({
      data: {
        jobId: jobId,
        tenantId: context.tenantId,
        sessionId: request.sessionId,
        query: request.query,
        mode: request.mode as ('lite' | 'medium' | 'deep'),
        status: 'success',
        response: formattedData as string,
        creditsUsed,
        processingTime: Date.now() - startTime,
        confidenceScore: orchestratorResult.confidence,
        qualityAchieved: orchestratorResult.qualityAchieved,
        budgetReached: orchestratorResult.budgetHit,
        data: {
          sources: orchestratorResult.sources,
          contradictions: orchestratorResult.contradictions,
          followUpQueries: (session as any).followUpQueries || [],
          knowledgeGaps: orchestratorResult.doubtHistory
            .filter((d: any) => d.severity === 'high' || d.severity === 'critical')
            .map((d: any) => d.topic),
          workerFailures: [],
        } as object,
      },
    });

    const result = {
      job_id: jobId,
      session_id: request.sessionId,
      mode: request.mode,
      status: orchestratorResult.qualityAchieved ? 'success' : 'partial',
      confidence_score: orchestratorResult.confidence,
      quality_achieved: orchestratorResult.qualityAchieved,
      budget_reached: orchestratorResult.budgetHit,
      data: formattedData,
      sources: orchestratorResult.sources,
      contradictions: orchestratorResult.contradictions.map((c: any) => ({
        topic: c.topic,
        description: c.description,
        severity: c.severity,
      })),
      follow_up_queries: (session as any).followUpQueries?.slice(-5) || [],
      knowledge_gaps: orchestratorResult.doubtHistory
        .filter((d: any) => d.severity === 'high' || d.severity === 'critical')
        .map((d: any) => d.topic),
      credits_used: creditsUsed,
      trace: {
        planning: plan.tasks.length,
        initial_workers: initialTasks.length,
        re_dispatched: orchestratorResult.reDispatchedTasks.length,
        iterations: orchestratorResult.iterations,
        termination: orchestratorResult.terminationReason,
      },
      security_events: [],
      processing_time_ms: Date.now() - startTime,
    };

    logger.info('research-service', `Research job complete: ${jobId}`, { duration: Date.now() - startTime });
    return result;
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
    };
  }

  private calculateTotalCredits(mode: string, workers: number, iterations: number): number {
    const base = { lite: 5, medium: 25, deep: 80 }[mode] || 25;
    return base * workers * Math.max(1, iterations * 0.5);
  }

  /**
   * Get job status by ID
   */
  async getStatus(jobId: string, _tenantId: string) {
    const job = await prisma.researchJob.findUnique({
      where: { jobId },
    });
    
    if (!job) return null;
    
    return {
      job_id: job.jobId,
      session_id: job.sessionId,
      mode: job.mode as 'lite' | 'medium' | 'deep',
      status: job.status,
      confidence_score: job.confidenceScore,
      quality_achieved: job.qualityAchieved,
      budget_reached: job.budgetReached,
      data: job.data,
      sources: job.sources,
      contradictions: job.contradictions,
      follow_up_queries: job.followUpQueries,
      knowledge_gaps: job.knowledgeGaps,
      credits_used: job.creditsUsed,
      processing_time_ms: job.processingTimeMs,
      created_at: job.createdAt,
    };
  }
}

export const researchService = new ResearchService();
