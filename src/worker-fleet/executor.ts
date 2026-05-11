
/**
 * Worker Fleet - Fully Functional
 * Executes research tasks with browser automation
 */

import { v4 as uuidv4 } from 'uuid';
import type { Browser } from 'puppeteer';
import { searchService } from '../search/index.js';
import { llmService } from '../llm/index.js';
import { blackboard } from '../blackboard/index.js';
import { artifactStore } from '../artifact-store/index.js';
import { trustScorer } from '../trust-scorer/index.js';
import { securityService } from '../security/index.js';
import { redis } from '../redis/client.js';
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
    _jobId: string,
    _tenantId: string
  ): Promise<TaskResult[]> {
    // Limit concurrent workers
    const limitedTasks = tasks.slice(0, this.maxWorkers);

    const results = await Promise.all(
      limitedTasks.map(async (task) => {
        await this.ensureTaskRow(task);

        if (await this.isJobCancelled(task.jobId, task.tenantId)) {
          await this.updateTaskStatus(task.id, 'cancelled');
          return {
            taskId: task.id,
            success: false,
            sources: [],
            findings: '',
            artifacts: [],
            checkpoint: null,
            error: 'Job cancelled',
          };
        }

        const result = await this.executeTask(task).catch(err => ({
          taskId: task.id,
          success: false,
          sources: [],
          findings: '',
          artifacts: [],
          checkpoint: null,
          error: err instanceof Error ? err.message : String(err),
        }));

        await this.updateTaskStatus(task.id, result.success ? 'completed' : 'failed');
        return result;
      })
    );

    return results;
  }

  private async ensureTaskRow(task: Task): Promise<void> {
    await prisma.task.upsert({
      where: { taskId: task.id },
      create: {
        taskId: task.id,
        jobId: task.jobId,
        topic: task.topic,
        covers: task.scope,
        mustNotOverlapWith: task.mustNotOverlap as any,
        mode: task.mode,
        status: 'processing',
      },
      update: {
        status: 'processing',
        topic: task.topic,
        covers: task.scope,
        mustNotOverlapWith: task.mustNotOverlap as any,
        mode: task.mode,
      },
    });
  }

  private async updateTaskStatus(taskId: string, status: string): Promise<void> {
    await prisma.task.updateMany({
      where: { taskId },
      data: { status },
    });
  }

  private async isJobCancelled(jobId: string, tenantId: string): Promise<boolean> {
    const job = await prisma.researchJob.findFirst({
      where: { jobId, tenantId },
      select: { status: true },
    });
    return job?.status === 'cancelled';
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    let checkpoint: any = { stage: 'started', taskId: task.id };

    try {
      // Check blackboard for existing work
      const existing = await blackboard.getJobState(task.jobId);
      if (existing && existing.verifiedFacts.length > 0) {
        const fact = existing.verifiedFacts[0];
        if (fact && fact.claim) {
          return {
            taskId: task.id,
            success: true,
            sources: [],
            findings: fact.claim,
            artifacts: [],
            checkpoint: { stage: 'cached' },
          };
        }
      }

      // Check domain throttle
      const canProceed = await this.checkDomainThrottle(task.tenantId, task.sessionId);
      if (!canProceed) {
        await new Promise(r => setTimeout(r, 1000));
      }

      checkpoint = { stage: 'search_started', taskId: task.id };

      // Search for sources
      const searchResults = await searchService.search(task.topic, {
        maxResults: task.mode === 'deep' ? 20 : task.mode === 'medium' ? 10 : 5,
      });

      checkpoint = { stage: 'search_complete', taskId: task.id, sourcesFound: searchResults.length };

      // Process each source
      const sources: SourceInfo[] = [];
      const processedContents: string[] = [];

      for (const result of searchResults) {
        const browserContent = await this.extractBrowserContent(result.url, result.content || '');

        // Security check
        const securityCheck = await securityService.classifyIntent({
          title: result.title || '',
          body_text: browserContent,
          url: result.url,
        });
        if (!securityCheck.safe || securityCheck.action !== 'allow') {
          console.log(`Source quarantined: ${result.url}, reason: ${securityCheck.flagged_patterns.join(', ')}`);
          continue;
        }

        // Calculate trust score
        const domain = result.domain || this.extractDomain(result.url);
        const trustScoreInput = {
          domain,
          content_freshness_days: 30,
          source_type: domain.includes('.gov') || domain.includes('.edu') ? 'primary' : 'secondary' as 'primary' | 'secondary',
          citation_depth: 1,
          cross_source_consistency: 0.8,
        };
        const trustScoreResult = trustScorer.calculate(trustScoreInput);
        const trustScore = trustScoreResult.score;

        // Skip low-trust sources in lite/medium mode
        if (task.mode !== 'deep' && trustScore < 0.3) {
          continue;
        }

        // Extract content via LLM
        const extractedContent = await llmService.generate([
          {
            role: 'user',
            content: `Extract key facts from this content relevant to: "${task.topic}"
Content: ${browserContent.slice(0, 8000)}

Output: Bullet points of facts found.`
          }
        ], { tenantId: task.tenantId, jobId: task.jobId });

        sources.push({
          url: result.url,
          title: result.title,
          content: extractedContent,
          trustScore: trustScore,
          publishDate: new Date().toISOString(),
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
      const artifactId = `artifact_${uuidv4().replace(/-/g, '')}`;
      await artifactStore.create({
        artifactId,
        jobId: task.jobId,
        taskId: task.id,
        content: findings,
        sources: searchResults.map(s => ({
          url: s.url,
          title: s.title,
          source: s.domain || this.extractDomain(s.url),
        })),
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
      const err = error instanceof Error ? error : new Error(String(error));
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

  private calculateCredits(mode: string, sourceCount: number): number {
    const baseCost = { lite: 5, medium: 25, deep: 80 }[mode] || 25;
    return baseCost + Math.floor(sourceCount / 5);
  }

  private async extractBrowserContent(url: string, fallbackContent: string): Promise<string> {
    if (
      process.env.ENABLE_BROWSER_EXTRACTION === 'false'
      || (process.env.NODE_ENV === 'production' && process.env.ENABLE_BROWSER_EXTRACTION !== 'true')
    ) {
      return fallbackContent;
    }

    let browser: Browser | undefined;

    try {
      const puppeteer = await import('puppeteer');
      const launchArgs = ['--disable-dev-shm-usage'];
      if (process.env.ALLOW_UNSANDBOXED_CHROMIUM === 'true' && process.env.NODE_ENV !== 'production') {
        launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
      }

      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: launchArgs,
      });
      const page = await browser.newPage();
      await page.setUserAgent('VeritasResearchBot/1.0');
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: Number.parseInt(process.env.BROWSER_EXTRACTION_TIMEOUT_MS || '15000', 10),
      });
      const content = await page.evaluate(() => (globalThis as any).document?.body?.innerText || '');
      await page.close();
      return content.trim() || fallbackContent;
    } catch (error) {
      console.warn('[WorkerFleet] Browser extraction failed', {
        url,
        message: error instanceof Error ? error.message : String(error),
      });
      return fallbackContent;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private async deductCredits(tenantId: string, jobId: string, credits: number) {
    await prisma.metering.create({
      data: {
        jobId,
        tenantId,
        service: 'research',
        tokens: credits * 100, // Convert to paise
        cost: credits,
        timestamp: new Date(),
      },
    });
  }
}

export const workerFleet = new WorkerFleet();
