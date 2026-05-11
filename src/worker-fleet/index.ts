
import { Task, TaskResult, Source } from '../types/index.js';
import { blackboard } from '../blackboard/index.js';
import { artifactStore } from '../artifact-store/index.js';
import { TavilySearchService } from '../search/providers/tavily.js';
import { trustScorer } from '../trust-scorer/index.js';
import { securityService } from '../security/index.js';
import { prisma } from '../database/client.js';

const searchService = new TavilySearchService();

interface WorkerOptions {
  jobId: string;
  tenantId: string;
  mode: 'lite' | 'medium' | 'deep';
}

export class WorkerFleet {
  options: WorkerOptions;

  constructor(options: WorkerOptions) {
    this.options = options;
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const taskId = task.task_id;
    const artifactId = task.artifact_id || `${this.options.jobId}_artifact_${taskId}`;

    const jobState = await blackboard.getJobState(this.options.jobId);
    const searchResults = await searchService.search(task.query || '', { maxResults: task.source_config?.target_sources || 5 });
    const sources: Partial<Source>[] = [];

    for (const result of searchResults) {
      const securityCheck = await securityService.classifyIntent({
        title: result.title,
        body_text: result.content,
        url: result.url,
      });

      if (securityCheck.action === 'block') continue;

      const domain = new URL(result.url).hostname.replace('www.', '');
      const trustScoreResult = trustScorer.calculate({
        domain: domain,
        content_freshness_days: 365,
        source_type: 'secondary',
        citation_depth: 0,
        cross_source_consistency: 0.5,
      });

      sources.push({
        url: result.url,
        title: result.title,
        trust_score: trustScoreResult.score,
        type: 'secondary',
        publish_date: new Date().toISOString(),
        content_excerpt: result.content.slice(0, 500),
      });
    }

    const result: TaskResult = {
      task_id: taskId,
      status: 'completed',
      summary: sources.map(s => `- ${s.title}`).join('\n'),
      sources: sources as Source[],
      processedUrls: sources.map(s => s.url!),
      artifacts: { raw: `${artifactId}_raw`, summary: `${artifactId}_summary` },
      metadata: { duration_ms: 0, sources_count: sources.length, queries_made: 1, tokens_used: 0 },
    };

    // Fix: artifactStore doesn't have save method, use create instead
    await artifactStore.create({
      artifactId: artifactId,
      jobId: this.options.jobId,
      taskId: taskId,
      content: JSON.stringify(result),
      sources: sources.map(s => ({
        url: s.url,
        title: s.title,
        domain: new URL(s.url!).hostname,
      })) as Record<string, unknown>[],
    });
    return result;
  }

  async executeAll(tasks: Task[]): Promise<TaskResult[]> {
    return Promise.all(tasks.map(task => this.executeTask(task)));
  }
}

export default WorkerFleet;
