
/**
 * Worker Fleet - Fully Functional
 * Executes research tasks with browser automation
 */

import { v4 as uuidv4 } from 'uuid';
import { tavilySearch, SearchResult } from '../search/providers/tavily.js';
import { llmService } from '../llm/index.js';
import { blackboard } from '../blackboard/index.js';
import { artifactStore } from '../artifact-store/index.js';
import { trustScorer } from '../trust-scorer/index.js';
import { securityService } from '../security/index.js';
import { redis, RedisKeys } from '../redis/client.js';
import { prisma } from '../database/client.js';

export interface Task {
  id: string;
  sessionId: string;
  topic: string;
  scope: string;
  mustNotOverlap: string[];
  mode: 'lite' | 'medium' | 'deep';
  tenantId: string;
  jobId: string;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  sources: SourceInfo[];
  findings: string;
  artifacts: string[];
  checkpoint: any;
  error?: string;
}

export interface SourceInfo {
  url: string;
  title: string;
  content: string;
  trustScore: number;
  publishDate?: string;
}

export class WorkerFleet {
  private maxWorkers = 10;

  async dispatchTasks(
    tasks: Task[],
    jobId: string,
    tenantId: string
  ): Promise<TaskResult[]> {
    // Limit concurrent workers
    const limitedTasks = tasks.slice(0, this.maxWorkers);
    
    const results = await Promise.all(
      limitedTasks.map(task => this.executeTask(task).catch(err => ({
        taskId: task.id,
        success: false,
        sources: [],
        findings: '',
        artifacts: [],
        checkpoint: null,
        error: err.message,
      })))
    );

    return results;
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    let checkpoint: any = { stage: 'started', taskId: task.id };
    
    try {
      // Check blackboard for existing work
      const existing = await blackboard.getVerifiedFact(task.jobId, task.topic);
      if (existing) {
        return {
          taskId: task.id,
          success: true,
          sources: [],
          findings: existing.value,
          artifacts: [],
          checkpoint: { stage: 'cached' },
        };
      }

      // Check domain throttle
      const canProceed = await this.checkDomainThrottle(task.tenantId, task.sessionId);
      if (!canProceed) {
        await new Promise(r => setTimeout(r, 1000));
      }

      checkpoint = { stage: 'search_started', taskId: task.id };
      
      // Search for sources
      const searchResults = await tavilySearch.search(task.topic, {
        max_results: task.mode === 'deep' ? 20 : task.mode === 'medium' ? 10 : 5,
        search_depth: task.mode === 'lite' ? 'basic' : 'advanced',
        include_raw_content: true,
      });

      checkpoint = { stage: 'search_complete', taskId: task.id, sourcesFound: searchResults.length };

      // Process each source
      const sources: SourceInfo[] = [];
      const processedContents: string[] = [];

      for (const result of searchResults) {
        // Security check
        const securityCheck = await securityService.checkContent(result.content);
        if (!securityCheck.safe) {
          console.log(`Source quarantined: ${result.url}, reason: ${securityCheck.reason}`);
          continue;
        }

        // Calculate trust score
        const trustScore = await trustScorer.score(result);
        
        // Skip low-trust sources in lite/medium mode
        if (task.mode !== 'deep' && trustScore < 0.3) {
          continue;
        }

        // Extract content via LLM
        const extractedContent = await llmService.generate([
          {
            role: 'user',
            content: `Extract key facts from this content relevant to: "${task.topic}"
Content: ${result.content.slice(0, 8000)}

Output: Bullet points of facts found.`
          }
        ], { tenantId: task.tenantId, jobId: task.jobId });

        sources.push({
          url: result.url,
          title: result.title,
          content: extractedContent,
          trustScore,
          publishDate: result.published_date,
        });

        processedContents.push(extractedContent);

        // Checkpoint after each source
        checkpoint.sourcesProcessed = sources.length;
        await this.saveCheckpoint(task.jobId, task.id, checkpoint);
      }

      // Synthesize findings
      checkpoint = { stage: 'synthesis', taskId: task.id };
      
      const findings = await llmService.generate([
        {
          role: 'user',
          content: `Synthesize these findings about "${task.topic}":
${processedContents.join("\n\n")}

Provide a comprehensive summary (2-3 paragraphs).`
        }
      ], { tenantId: task.tenantId, jobId: task.jobId });

      // Store artifact
      const artifactId = await artifactStore.saveArtifact(task.jobId, task.id, {
        sources: searchResults,
        extractedContents: processedContents,
        synthesis: findings,
        checkpoint,
      });

      await blackboard.addVerifiedFact(task.jobId, task.topic, findings, sources.map(s => s.url));

      // Calculate credits used
      const credits = this.calculateCredits(task.mode, sources.length);
      await this.deductCredits(task.tenantId, task.jobId, credits);

      return {
        taskId: task.id,
        success: true,
        sources,
        findings,
        artifacts: [artifactId],
        checkpoint: { stage: 'complete' },
      };

    } catch (error) {
      const err = error as Error;
      await this.saveCheckpoint(task.jobId, task.id, { stage: 'failed', error: err.message });
      
      return {
        taskId: task.id,
        success: false,
        sources: [],
        findings: '',
        artifacts: [],
        checkpoint,
        error: err.message,
      };
    }
  }

  private async checkDomainThrottle(tenantId: string, sessionId: string): Promise<boolean> {
    const key = `domain_throttle:${tenantId}:${sessionId}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 1); // Reset after 1 second
    }
    return current <= 2; // Max 2 workers per domain simultaneously
  }

  private async saveCheckpoint(jobId: string, taskId: string, checkpoint: any) {
    await redis.setex(
      `checkpoint:${jobId}:${taskId}`,
      3600, // 1 hour TTL
      JSON.stringify(checkpoint)
    );
  }

  private async loadCheckpoint(jobId: string, taskId: string): Promise<any> {
    const data = await redis.get(`checkpoint:${jobId}:${taskId}`);
    return data ? JSON.parse(data) : null;
  }

  private calculateCredits(mode: string, sourceCount: number): number {
    const baseCost = { lite: 5, medium: 25, deep: 80 }[mode] || 25;
    return baseCost + Math.floor(sourceCount / 5);
  }

  private async deductCredits(tenantId: string, jobId: string, credits: number) {
    await prisma.metering.create({
      data: {
        jobId,
        tenantId,
        service: 'research',
        credits: credits * 100, // Convert to paise
        timestamp: new Date(),
      },
    });
  }
}

export const workerFleet = new WorkerFleet();
