
import { Task, TaskResult, SessionMemory } from '../types/index.js';
import { blackboard } from '../blackboard/index.js';
import { artifactStore } from '../artifact-store/index.js';
import { searchService } from '../search/index.js';
import { trustScorer } from '../trust-scorer/index.js';
import { securityService } from '../security/index.js';
import { prisma } from '../database/client.js';

interface WorkerOptions {
  jobId: string;
  tenantId: string;
  mode: string;
}

export class WorkerFleet {
  options: WorkerOptions;

  constructor(options: WorkerOptions) {
    this.options = options;
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const taskId = task.task_id;
    const artifactId = task.artifact_id || `${this.options.jobId}_artifact_${taskId}`;

    const blackboardData = await blackboard.read(this.options.jobId, this.options.mode);
    const searchResults = await searchService.search(task.query, { maxResults: task.source_config.target_sources });
    const sources = [];

    for (const result of searchResults) {
      const securityCheck = await securityService.classifyIntent({
        title: result.title,
        body_text: result.content,
        url: result.url,
      });

      if (securityCheck.action === 'block') continue;

      const trustScore = trustScorer.calculate({
        domain: result.domain,
        content_freshness_days: 365,
        source_type: 'secondary',
        citation_depth: 0,
        cross_source_consistency: 0.5,
      });

      sources.push({
        url: result.url,
        title: result.title,
        domain: result.domain,
        content_excerpt: result.content,
        trust_score: trustScore.score,
        publish_date: result.published_date,
        source_type: 'secondary',
      });
    }

    const result: TaskResult = {
      task_id: taskId,
      status: 'completed',
      summary: sources.map(s => `- ${s.title}`).join('\n'),
      sources,
      processedUrls: sources.map(s => s.url),
      artifacts: { raw: `${artifactId}_raw`, summary: `${artifactId}_summary` },
      metadata: { duration_ms: 0, sources_count: sources.length, queries_made: 1, tokens_used: 0 },
    };

    await artifactStore.save(artifactId, this.options.tenantId, result, 'result');
    return result;
  }

  async executeAll(tasks: Task[]): Promise<TaskResult[]> {
    return Promise.all(tasks.map(task => this.executeTask(task)));
  }
}

export default WorkerFleet;
