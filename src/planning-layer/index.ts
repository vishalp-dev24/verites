/**
 * Planning Layer
 * Receives query, analyzes research requirements
 * Divvies work precisely across the worker fleet
 * Creates Task Manifest before any worker is dispatched
 */

import { OpenAI } from 'openai';
import { TaskManifest, Task, ResearchRequest, SessionMemory } from '../types/index.js';
import { redis } from '../redis/client.js';

interface PlanningInput {
  request: ResearchRequest;
  sessionMemory?: SessionMemory;
}

interface ResearchCost {
  min_paise: number;
  max_paise: number;
  confidence: number;
  breakdown: {
    worker_count: number;
    estimated_sources: number;
    estimated_iterations: number;
  };
}

export class PlanningLayer {
  private openai: OpenAI;
  private baseCostPerSource = 2; // paise
  private baseCostPerIteration = 10; // paise

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Generate Task Manifest from research request
   */
  async generateTaskManifest(input: PlanningInput): Promise<TaskManifest> {
    const { request, sessionMemory } = input;
    const startTime = Date.now();

    // 1. Read session memory for context
    const context = sessionMemory ? {
      previousTopics: sessionMemory.topics_researched,
      keyConclusions: sessionMemory.key_conclusions,
      recentQueries: sessionMemory.follow_up_queries,
    } : {
      previousTopics: [],
      keyConclusions: [],
      recentQueries: [],
    };

    // 2. Analyze query complexity
    const complexity = this.analyzeComplexity(request.query);

    // 3. Break query into sub-topics
    const subTopics = await this.breakIntoSubTopics(
      request.query,
      request.mode,
      context.previousTopics
    );

    // 4. Generate tasks from sub-topics
    const tasks: Task[] = this.generateTasks(subTopics, request.mode);

    // 5. Calculate cost estimate
    const estimatedCost = this.estimateCost(
      tasks.length,
      request.mode,
      complexity
    );

    // Generate fingerprint for deduplication
    const fingerprint = await this.generateFingerprint(request);

    const manifest: TaskManifest = {
      job_id: `manifest_${Date.now()}`,
      query: request.query,
      mode: request.mode,
      tasks,
      estimated_cost: estimatedCost,
      session_context: {
        topics_researched: context.previousTopics,
        follow_up_queries: context.recentQueries,
      },
      fingerprint,
      created_at: new Date().toISOString(),
      locked: false,
    };

    // Store manifest in Redis
    await redis.setex(
      `manifest:${fingerprint}`,
      3600,
      JSON.stringify(manifest)
    );

    console.log(`[Planning] Generated ${tasks.length} tasks in ${Date.now() - startTime}ms`);

    return manifest;
  }

  /**
   * Analyze query complexity
   */
  private analyzeComplexity(query: string): {
    complexity: 'low' | 'medium' | 'high';
    estimatedSources: number;
    estimatedIterations: number;
  } {
    const wordCount = query.split(/\s+/).length;
    const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;
    const hasComparisonWords = /compare|versus|vs|difference|similar|better/i.test(query);
    const hasTimeRange = /\b\d{4}\b|\blast|recent|current|latest/i.test(query);
    const hasTechnicalTerms = /technical|algorithm|implementation|architecture/i.test(query);

    let score = 0;
    if (wordCount > 20) score++;
    if (hasMultipleQuestions) score += 2;
    if (hasComparisonWords) score++;
    if (hasTimeRange) score++;
    if (hasTechnicalTerms) score += 2;

    if (score <= 2) {
      return { complexity: 'low', estimatedSources: 5, estimatedIterations: 1 };
    } else if (score <= 5) {
      return { complexity: 'medium', estimatedSources: 15, estimatedIterations: 2 };
    } else {
      return { complexity: 'high', estimatedSources: 40, estimatedIterations: 3 };
    }
  }

  /**
   * Break query into sub-topics using LLM
   */
  private async breakIntoSubTopics(
    query: string,
    mode: string,
    previousTopics: string[]
  ): Promise<string[]> {
    const systemPrompt = `Break down the research query into discrete, non-overlapping sub-topics. Each sub-topic should be something a worker can research independently. Return as a JSON array of strings.`;

    const promptContent = `Query: ${query}\n\nMode: ${mode} (lite/medium/deep)\n\nAlready researched: ${previousTopics.join(', ') || 'none'}\n\nBreak into sub-topics:`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptContent },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return parsed.sub_topics || parsed.topics || [query];
      }
    } catch (error) {
      console.error('[Planning] Failed to break into sub-topics:', error);
    }

    // Fallback: single topic
    return [query];
  }

  /**
   * Generate tasks from sub-topics
   */
  private generateTasks(
    subTopics: string[],
    mode: string
  ): Task[] {
    const modeLimits: Record<string, { maxWorkers: number; sourcesPerWorker: number }> = {
      lite: { maxWorkers: 5, sourcesPerWorker: 5 },
      medium: { maxWorkers: 8, sourcesPerWorker: 15 },
      deep: { maxWorkers: 10, sourcesPerWorker: 50 },
    };

    const limits = modeLimits[mode] || modeLimits.medium;
    const numWorkers = Math.min(subTopics.length, limits.maxWorkers);

    // Combine sub-topics if we have fewer than needed
    const workers: string[][] = [];
    const topicsPerWorker = Math.ceil(subTopics.length / numWorkers);

    for (let i = 0; i < numWorkers; i++) {
      const start = i * topicsPerWorker;
      const end = Math.min(start + topicsPerWorker, subTopics.length);
      workers.push(subTopics.slice(start, end));
    }

    return workers.map((topics, index) => ({
      task_id: `task_${Date.now()}_${index}`,
      title: topics.join(' | ').substring(0, 100),
      query: topics.join(' OR '),
      mode,
      source_config: {
        max_sources: limits.sourcesPerWorker,
        target_sources: Math.floor(limits.sourcesPerWorker * 0.8),
        date_range_days: mode === 'deep' ? undefined : 365,
      },
      coverage: {
        must_cover: topics,
        must_not_overlap: workers
          .filter((_, i) => i !== index)
          .flat(),
      },
      estimated_cost: {
        min_paise: topics.length * this.baseCostPerSource,
        max_paise: topics.length * this.baseCostPerSource * 2,
      },
      status: 'planning' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      started_at: undefined,
      completed_at: undefined,
      result: undefined,
      artifact_id: undefined,
      checkpoint: undefined,
    }));
  }

  /**
   * Estimate research cost
   */
  private estimateCost(
    workerCount: number,
    mode: string,
    complexity: { estimatedSources: number; estimatedIterations: number }
  ): ResearchCost {
    const modeMultiplier: Record<string, number> = {
      lite: 1,
      medium: 3,
      deep: 10,
    };

    const baseCost = workerCount * complexity.estimatedSources * this.baseCostPerSource * modeMultiplier[mode];
    const iterationCost = complexity.estimatedIterations * this.baseCostPerIteration;

    const min = baseCost;
    const max = baseCost * 2 + iterationCost;

    return {
      min_paise: min,
      max_paise: max,
      confidence: 0.7 + (0.1 * (3 - complexity.estimatedIterations)),
      breakdown: {
        worker_count: workerCount,
        estimated_sources: complexity.estimatedSources,
        estimated_iterations: complexity.estimatedIterations,
      },
    };
  }

  /**
   * Generate fingerprint for deduplication
   */
  private async generateFingerprint(request: ResearchRequest): Promise<string> {
    const hash = require('crypto').createHash('sha256');
    hash.update(request.query);
    hash.update(request.mode);
    return hash.digest('hex').substring(0, 32);
  }

  /**
   * Lock manifest (prevent modification)
   */
  async lockManifest(manifestId: string): Promise<void> {
    const data = await redis.get(`manifest:${manifestId}`);
    if (data) {
      const manifest = JSON.parse(data);
      manifest.locked = true;
      await redis.setex(
        `manifest:${manifestId}`,
        3600,
        JSON.stringify(manifest)
      );
    }
  }
}

export const planningLayer = new PlanningLayer();
