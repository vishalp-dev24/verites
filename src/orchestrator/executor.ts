
/**
 * Veritas Orchestrator Executor
 *
 * The orchestrator:
 * 1. Receives initial worker results
 * 2. Analyzes for doubts (gaps, contradictions, low confidence)
 * 3. Re-dispatches workers for specific gaps
 * 4. Iterates until quality threshold or max iterations
 * 5. Self-terminates with final synthesis
 */

import { v4 as uuidv4 } from 'uuid';
import { analyzeForDoubts, type Doubt, type Finding } from './doubt-engine.js';
import { workerFleet, type Task } from '../worker-fleet/executor.js';
import { blackboard } from '../blackboard/index.js';
import { artifactStore } from '../artifact-store/index.js';
import { llmService } from '../llm/index.js';
import { logger } from '../utils/logger.js';
import { redis } from '../redis/client.js';
import { prisma } from '../database/client.js';

export interface OrchestratorConfig {
  jobId: string;
  tenantId: string;
  sessionId: string;
  originalQuery: string;
  mode: 'lite' | 'medium' | 'deep';
  qualityThreshold: number;
  maxIterations: number;
  maxBudgetPaise: number;
}

export interface OrchestratorResult {
  confidence: number;
  findings: string;
  structuredData: any;
  sources: any[];
  contradictions: any[];
  iterations: number;
  qualityAchieved: boolean;
  budgetHit: boolean;
  reDispatchedTasks: string[];
  doubtHistory: Doubt[];
  terminationReason: 'quality_met' | 'max_iterations' | 'budget_exhausted' | 'no_doubts';
}

export class OrchestratorExecutor {
  async run(config: OrchestratorConfig): Promise<OrchestratorResult> {
    let iteration = 0;
    let totalCost = 0;
    const reDispatchedTasks: string[] = [];
    const doubtHistory: Doubt[] = [];

    logger.info('Orchestrator', 'Starting orchestrator loop', { jobId: config.jobId, query: config.originalQuery });

    // Initial state from workers
    let currentFindings = await this.getCurrentFindings(config.jobId);

    while (iteration < config.maxIterations) {
      await this.ensureNotCancelled(config);
      iteration++;
      logger.info('Orchestrator', `Orchestrator iteration ${iteration}`, { jobId: config.jobId });

      // Phase 1: Analyze for doubts
      const doubtAnalysis = await analyzeForDoubts(
        config.originalQuery,
        this.convertToFindings(currentFindings),
        config.mode
      );

      logger.debug('Orchestrator', 'Doubt analysis complete', {
        doubtsFound: doubtAnalysis.doubts.length,
        overallConfidence: doubtAnalysis.overallConfidence,
        recommendation: doubtAnalysis.recommendation,
      });

      doubtHistory.push(...doubtAnalysis.doubts);

      // Phase 2: Check termination conditions
      if (doubtAnalysis.overallConfidence >= config.qualityThreshold) {
        logger.info('Orchestrator', 'Quality threshold met', { confidence: doubtAnalysis.overallConfidence });
        return this.terminate(config, {
          confidence: doubtAnalysis.overallConfidence,
          findings: currentFindings,
          iterations: iteration,
          qualityAchieved: true,
          reDispatchedTasks,
          doubtHistory,
          terminationReason: 'quality_met',
          budgetHit: false,
        });
      }

      if (doubtAnalysis.recommendation === 'proceed' && doubtAnalysis.doubts.length === 0) {
        logger.info('Orchestrator', 'No doubts found, proceeding');
        return this.terminate(config, {
          confidence: doubtAnalysis.overallConfidence,
          findings: currentFindings,
          iterations: iteration,
          qualityAchieved: doubtAnalysis.overallConfidence >= 0.7,
          reDispatchedTasks,
          doubtHistory,
          terminationReason: 'no_doubts',
          budgetHit: false,
        });
      }

      // Phase 3: Check budget
      const iterationCost = this.estimateIterationCost(config.mode, doubtAnalysis.doubts.length);
      totalCost += iterationCost;

      if (totalCost * 100 >= config.maxBudgetPaise) {
        logger.warn('Orchestrator', 'Budget exhausted', { totalCost, budget: config.maxBudgetPaise });
        return this.terminate(config, {
          confidence: doubtAnalysis.overallConfidence,
          findings: currentFindings,
          iterations: iteration,
          qualityAchieved: false,
          reDispatchedTasks,
          doubtHistory,
          terminationReason: 'budget_exhausted',
          budgetHit: true,
        });
      }

      // Phase 4: Re-dispatch workers for top doubts
      const topDoubts = doubtAnalysis.doubts
        .filter(d => d.severity !== 'low')
        .slice(0, 2);

      if (topDoubts.length === 0) {
        logger.info('Orchestrator', 'No high-severity doubts to address');
        break;
      }

      logger.info('Orchestrator', `Re-dispatching for ${topDoubts.length} doubts`);

      for (const doubt of topDoubts) {
        await this.ensureNotCancelled(config);
        const task = this.doubtToTask(doubt, config);

        logger.debug('Orchestrator', 'Dispatching task for doubt', {
          doubtId: doubt.id,
          type: doubt.type,
          query: task.topic,
        });

        const results = await workerFleet.dispatchTasks([task], config.jobId, config.tenantId);

        for (const result of results) {
          if (result.success) {
            await this.updateBlackboard(config.jobId, result);
            reDispatchedTasks.push(task.id);
          }
        }
      }

      // Phase 5: Update findings and checkpoint
      currentFindings = await this.getCurrentFindings(config.jobId);
      await this.saveCheckpoint(config.jobId, iteration, currentFindings, totalCost);

      // Adaptive throttling based on mode
      if (config.mode === 'deep') {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Max iterations reached
    const finalConfidence = await this.calculateFinalConfidence(config.jobId);
    logger.info('Orchestrator', 'Max iterations reached', { iterations: iteration, finalConfidence });

    return this.terminate(config, {
      confidence: finalConfidence,
      findings: currentFindings,
      iterations: iteration,
      qualityAchieved: finalConfidence >= config.qualityThreshold,
      reDispatchedTasks,
      doubtHistory,
      terminationReason: 'max_iterations',
      budgetHit: false,
    });
  }

  private async getCurrentFindings(jobId: string): Promise<any[]> {
    const facts = await blackboard.getJobState(jobId);
    if (facts?.verifiedFacts?.length) {
      return facts.verifiedFacts;
    }

    const artifacts = await artifactStore.getByJobId(jobId);
    return artifacts.map((artifact) => ({
      id: artifact.artifact_id,
      taskId: artifact.task_id,
      topic: artifact.task_id,
      claim: artifact.content,
      content: artifact.content,
      value: artifact.content,
      sources: artifact.sources,
      confidence: 0.7,
      verified: true,
    }));
  }

  private async ensureNotCancelled(config: OrchestratorConfig): Promise<void> {
    const job = await prisma.researchJob.findFirst({
      where: {
        jobId: config.jobId,
        tenantId: config.tenantId,
      },
      select: { status: true },
    });

    if (job?.status === 'cancelled') {
      throw new Error('Job cancelled');
    }
  }

  private convertToFindings(data: any[]): Finding[] {
    return data.map(d => ({
      taskId: d.taskId || d.id || 'unknown',
      topic: d.topic || d.key || 'Unknown',
      content: d.claim || d.value || d.content || d.findings || '',
      sources: d.sources || d.sourceUrls || [],
      confidence: d.confidence || 0.5,
    }));
  }

  private doubtToTask(doubt: Doubt, config: OrchestratorConfig): Task {
    return {
      id: `${config.jobId}_redispatch_${uuidv4().replace(/-/g, '')}`,
      sessionId: config.sessionId,
      topic: doubt.suggestedQuery,
      scope: `Address doubt: ${doubt.description}`,
      mustNotOverlap: doubt.relatedTaskIds,
      mode: config.mode,
      tenantId: config.tenantId,
      jobId: config.jobId,
    };
  }

  private async updateBlackboard(jobId: string, result: any): Promise<void> {
    await blackboard.addVerifiedFact(
      jobId,
      `Re-dispatch: ${result.taskId}`,
      result.findings,
      result.sources?.map((s: any) => s.url) || []
    );

    if (result.artifacts?.length > 0) {
      await artifactStore.markUsed(result.artifacts[0]);
    }
  }

  private estimateIterationCost(mode: string, doubtCount: number): number {
    const baseCost = mode === 'deep' ? 80 : mode === 'medium' ? 25 : 5;
    return baseCost * doubtCount;
  }

  private async calculateFinalConfidence(jobId: string): Promise<number> {
    const findings = await this.getCurrentFindings(jobId);
    if (findings.length === 0) return 0;

    const prompt = `Rate the overall quality of these research findings (0-1 scale):
${findings.map((f: any, i: number) => `${i + 1}. ${(f.claim || f.value || f.content || '').slice(0, 200)}`).join('\n')}

Return only a number.`;

    try {
      const response = await llmService.generate([{ role: 'user', content: prompt }], { temperature: 0 });
      const match = response.match(/(\d+\.?\d*)/);
      return match ? Math.min(1, parseFloat(match[1])) : 0.5;
    } catch {
      return 0.5;
    }
  }

  private async saveCheckpoint(
    jobId: string,
    iteration: number,
    findings: any[],
    cost: number
  ): Promise<void> {
    await redis.setex(
      `orchestrator_checkpoint:${jobId}`,
      86400, // 24 hours
      JSON.stringify({ iteration, findingsCount: findings.length, cost, timestamp: Date.now() })
    );
  }

  private async terminate(
    config: OrchestratorConfig,
    state: any
  ): Promise<OrchestratorResult> {
    // Final synthesis
    const synthesis = await this.synthesizeFindings(config, state.findings);

    // Extract contradictions
    const contradictions = state.doubtHistory
      .filter((d: Doubt) => d.type === 'contradiction')
      .map((d: Doubt) => ({
        topic: d.topic,
        description: d.description,
        severity: d.severity,
      }));

    return {
      confidence: state.confidence,
      findings: synthesis.text,
      structuredData: synthesis.structured,
      sources: synthesis.sources,
      contradictions,
      iterations: state.iterations,
      qualityAchieved: state.qualityAchieved,
      budgetHit: state.budgetHit,
      reDispatchedTasks: state.reDispatchedTasks,
      doubtHistory: state.doubtHistory,
      terminationReason: state.terminationReason,
    };
  }

  private async synthesizeFindings(config: OrchestratorConfig, findings: any[]): Promise<any> {
    const combinedFindings = findings
      .map((f: any) => f.value || f.content || f.findings || '')
      .filter(Boolean)
      .join('\n\n');

    const prompt = `Synthesize these research findings into a comprehensive summary:
Original Query: "${config.originalQuery}"

Findings:
${combinedFindings.slice(0, 10000)}

Provide:
1. A concise summary (2-3 paragraphs)
2. Key facts uncovered
3. Confidence level
4. Most relevant sources

Return as JSON: {"summary": "text", "keyFacts": ["fact1"], "confidence": 0.85}`;

    try {
      const response = await llmService.generate([{ role: 'user', content: prompt }], {});
      const structured = JSON.parse(response);

      return {
        text: structured.summary || combinedFindings,
        structured,
        sources: findings.flatMap((f: any) => f.sources || f.sourceUrls || []),
      };
    } catch {
      return {
        text: combinedFindings,
        structured: { summary: combinedFindings.slice(0, 500) },
        sources: [],
      };
    }
  }
}

export const orchestratorExecutor = new OrchestratorExecutor();
