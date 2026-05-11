
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
import { contradictionEngine } from './contradiction-engine/index.js';
import { formatter } from './formatter/index.js';
import { blackboard } from './blackboard/index.js';
import { artifactStore } from './artifact-store/index.js';
import { sessionMemoryService } from './session-memory/index.js';
import { billingService } from './billing/billing-service.js';
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

    logger.info(`Starting research job`, { jobId, query: request.query, tenantId: context.tenantId });

    // 1. Get session memory
    const session = await sessionMemoryService.getSession(
      request.sessionId,
      context.tenantId
    );

    // 2. Pre-research cost estimation
    const costEstimate = await this.estimateCostInternal(request);
    const maxBudget = request.costControls?.maxBudgetPaise || 2500;

    if (costEstimate.min_paise > maxBudget) {
      logger.warn(`Cost exceeds budget`, { jobId, min: costEstimate.min_paise, max: maxBudget });
      return {
        job_id: jobId,
        status: 'rejected',
        reason: 'estimated_cost_exceeds_budget',
        estimate: costEstimate,
      };
    }

    // 3. Planning phase
    logger.info(`Planning phase`, { jobId });
    const plan = await llmService.planResearch(request.query, session);

    // 4. Execute initial workers
    logger.info(`Dispatching ${Math.min(plan.tasks.length, 5)} workers`, { jobId });
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
    logger.info(`Starting orchestrator loop`, { jobId });
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
    
    logger.info(`Orchestrator complete`, { 
      jobId, 
      iterations: orchestratorResult.iterations,
      confidence: orchestratorResult.confidence,
      qualityAchieved: orchestratorResult.qualityAchieved,
      reDispatched: orchestratorResult.reDispatchedTasks.length,
    });

    // 6. Format output
    logger.info(`Formatting output`, { jobId });
    const formattedData = await formatter.format(
      orchestratorResult.findings,
      request.outputSchema
    );

    // 7. LLM-as-Judge evaluation
    logger.info(`Running quality evaluation`, { jobId });
    const evaluation = await llmService.evaluate(
      request.query,
      formattedData,
      orchestratorResult.sources
    );

    // 8. Update session memory
    await sessionMemoryService.addToSession(
      request.sessionId,
      context.tenantId,
      {
        topic: request.query,
        conclusion: formattedData?.summary || orchestratorResult.findings.slice(0, 200),
        timestamp: new Date(),
      }
    );

    // 9. Calculate and deduct credits
    const creditsUsed = this.calculateTotalCredits(
      request.mode,
      initialTasks.length + orchestratorResult.reDispatchedTasks.length,
      orchestratorResult.iterations
    );

    await billingService.deductCredits(context.tenantId, jobId, creditsUsed);

    // 10. Save job record
    await prisma.researchJob.create({
      data: {
        id: jobId,
        tenantId: context.tenantId,
        sessionId: request.sessionId,
        query: request.query,
        mode: request.mode,
        status: 'success',
        response: JSON.stringify(formattedData),
        creditsUsed,
        processingTime: Date.now() - startTime,
        iterations: orchestratorResult.iterations,
        confidence: orchestratorResult.confidence,
        createdAt: new Date(startTime),
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
      contradictions: orchestratorResult.contradictions.map(c => ({
        topic: c.topic,
        description: c.description,
        severity: c.severity,
      })),
      follow_up_queries: session.topics?.slice(-5) || [],
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

    logger.info(`Research job complete`, { jobId, duration: Date.now() - startTime });
    return result;
  }

  async estimateCost(query: string, mode: string, sessionId: string) {
    return this.estimateCostInternal({ query, mode, sessionId, outputSchema: {} });
  }

  private async estimateCostInternal(request: Partial<ResearchRequest>) {
    const mode = request.mode || 'medium';
    const baseCost = { lite: 5, medium: 25, deep: 80 }[mode] || 25;
    
    const queryLength = request.query?.length || 50;
    const estimatedWorkers = Math.min(10, Math.max(2, Math.ceil(queryLength / 30)));
    const estimatedIterations = mode === 'deep' ? 4 : mode === 'medium' ? 2 : 1;

    const minPaise = baseCost * estimatedWorkers * 100;
    const maxPaise = baseCost * estimatedWorkers * estimatedIterations * 100;

    return {
      min_paise: minPaise,
      max_paise: maxPaise,
      confidence: 0.87,
      breakdown: {
        worker_count: estimatedWorkers,
        base_cost: baseCost,
        estimated_iterations: estimatedIterations,
      },
    };
  }

  private calculateTotalCredits(mode: string, workers: number, iterations: number): number {
    const base = { lite: 5, medium: 25, deep: 80 }[mode] || 25;
    return base * workers * Math.max(1, iterations * 0.5);
  }
}

export const researchService = new ResearchService();
