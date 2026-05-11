
/**
 * Veritas JavaScript SDK
 *
 * Example:
 * const { ResearchClient } = require('@veritas/sdk');
 *
 * const client = new ResearchClient({
 *   apiKey: 'your-api-key'
 * });
 *
 * const result = await client.research({
 *   query: 'Latest AI developments',
 *   mode: 'medium',
 *   sessionId: 'session-123',
 *   outputSchema: { type: 'object', properties: { summary: { type: 'string' } } }
 * });
 */

import axios from 'axios';

const DEFAULT_BASE_URL = 'https://api.veritas.research/v1';
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(['success', 'partial', 'failed', 'cancelled', 'rejected']);

export type ResearchMode = 'lite' | 'medium' | 'deep';

export interface ResearchClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}

export interface ResearchRequest {
  query: string;
  mode: ResearchMode;
  sessionId: string;
  outputSchema?: Record<string, any>;
  costControls?: {
    maxBudgetPaise?: number;
    fallbackMode?: ResearchMode;
    qualityThreshold?: number;
    maxIterations?: number;
  };
}

export interface ResearchPollOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ResearchResponse {
  jobId: string;
  sessionId: string;
  mode: string;
  status: string;
  confidenceScore: number;
  data: Record<string, any>;
  sources: any[];
  creditsUsed: number;
  trace: any;
  estimatedTime?: number;
  creditsReserved?: number;
  reason?: string;
  estimate?: any;
  billing?: any;
  qualityAchieved?: boolean;
  budgetReached?: boolean;
  contradictions?: any[];
  followUpQueries?: string[];
  knowledgeGaps?: string[];
  processingTimeMs?: number;
  createdAt?: string;
  completedAt?: string;
  error?: string;
}

export class ResearchTimeoutError extends Error {
  jobId: string;
  timeoutMs: number;
  lastResponse?: ResearchResponse;

  constructor(jobId: string, timeoutMs: number, lastResponse?: ResearchResponse) {
    super(`Research job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
    this.name = 'ResearchTimeoutError';
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    this.lastResponse = lastResponse;
  }
}

export class ResearchClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private pollIntervalMs: number;
  private requestTimeoutMs: number;

  constructor(config: ResearchClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async research(request: ResearchRequest, options: ResearchPollOptions = {}): Promise<ResearchResponse> {
    const submitted = await this.submit(request);
    if (this.isTerminalStatus(submitted.status)) return submitted;
    return this.waitForResult(submitted.jobId, options, submitted);
  }

  async submit(request: ResearchRequest): Promise<ResearchResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/research`,
        this.buildResearchPayload(request),
        {
          headers: {
            'X-API-Key': this.apiKey,
          },
          timeout: this.requestTimeoutMs,
        }
      );

      return this.transformResponse(response.data);
    } catch (error) {
      const rejected = this.transformRejectedResponse(error);
      if (rejected) return rejected;
      throw error;
    }
  }

  async submitResearch(request: ResearchRequest): Promise<ResearchResponse> {
    return this.submit(request);
  }

  async getStatus(jobId: string): Promise<ResearchResponse> {
    const response = await axios.get(
      `${this.baseUrl}/research/${jobId}`,
      {
        headers: { 'X-API-Key': this.apiKey },
        timeout: this.requestTimeoutMs,
      }
    );
    return this.transformResponse(response.data);
  }

  async status(jobId: string): Promise<ResearchResponse> {
    return this.getStatus(jobId);
  }

  async waitForResult(
    jobId: string,
    options: ResearchPollOptions = {},
    initialResponse?: ResearchResponse
  ): Promise<ResearchResponse> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const pollIntervalMs = options.pollIntervalMs ?? this.pollIntervalMs;
    const startedAt = Date.now();
    let lastResponse = initialResponse;

    while (true) {
      if (lastResponse && this.isTerminalStatus(lastResponse.status)) {
        return lastResponse;
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) {
        throw new ResearchTimeoutError(jobId, timeoutMs, lastResponse);
      }

      await this.sleep(Math.min(pollIntervalMs, remainingMs));
      lastResponse = await this.getStatus(jobId);
    }
  }

  async estimateCost(
    query: string,
    mode: ResearchMode,
    sessionId: string
  ): Promise<{
    minPaise: number;
    maxPaise: number;
    estimatedWorkers: number;
    estimatedTimeSeconds: number;
    estimatedCredits: number;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/estimate`,
      { query, mode, session_id: sessionId },
      {
        headers: { 'X-API-Key': this.apiKey },
        timeout: this.requestTimeoutMs,
      }
    );

    return {
      minPaise: response.data.min_paise,
      maxPaise: response.data.max_paise,
      estimatedWorkers: response.data.estimated_workers,
      estimatedTimeSeconds: response.data.estimated_time_seconds,
      estimatedCredits: response.data.estimated_credits,
    };
  }

  async getUsage(): Promise<{
    creditsUsed: number;
    creditsBalance: number;
    requestsThisMonth: number;
    tier: string;
  }> {
    const response = await axios.get(
      `${this.baseUrl}/usage`,
      {
        headers: { 'X-API-Key': this.apiKey },
        timeout: this.requestTimeoutMs,
      }
    );
    return response.data;
  }

  private buildResearchPayload(request: ResearchRequest): Record<string, any> {
    return {
      query: request.query,
      mode: request.mode,
      session_id: request.sessionId,
      output_schema: request.outputSchema ?? {},
      cost_controls: request.costControls ? {
        max_budget_paise: request.costControls.maxBudgetPaise,
        fallback_mode: request.costControls.fallbackMode,
        quality_threshold: request.costControls.qualityThreshold,
        max_iterations: request.costControls.maxIterations,
      } : undefined,
    };
  }

  private transformResponse(data: any): ResearchResponse {
    return {
      jobId: data.job_id || data.jobId,
      sessionId: data.session_id || data.sessionId || '',
      mode: data.mode || '',
      status: data.status || 'unknown',
      confidenceScore: data.confidence_score ?? data.confidenceScore ?? 0,
      data: data.data || {},
      sources: data.sources || [],
      creditsUsed: data.credits_used ?? data.creditsUsed ?? 0,
      trace: data.trace,
      estimatedTime: data.estimated_time,
      creditsReserved: data.credits_reserved,
      reason: data.reason,
      estimate: data.estimate,
      billing: data.billing,
      qualityAchieved: data.quality_achieved,
      budgetReached: data.budget_reached,
      contradictions: data.contradictions,
      followUpQueries: data.follow_up_queries,
      knowledgeGaps: data.knowledge_gaps,
      processingTimeMs: data.processing_time_ms,
      createdAt: data.created_at,
      completedAt: data.completed_at,
      error: data.error,
    };
  }

  private transformRejectedResponse(error: unknown): ResearchResponse | null {
    if (!axios.isAxiosError(error)) return null;

    const data = error.response?.data;
    if (!data || data.status !== 'rejected' || !data.job_id) return null;

    return this.transformResponse(data);
  }

  private isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// MCP Client
export class MCPResearchClient {
  private apiKey: string;
  private server: any;

  constructor(options: { apiKey: string }) {
    this.apiKey = options.apiKey;
  }

  async connect(): Promise<void> {
    throw new Error('MCPResearchClient is not implemented in this SDK. Use ResearchClient for HTTP API access.');
  }

  async research(_params: {
    query: string;
    mode: string;
    sessionId: string;
    outputSchema: Record<string, any>;
  }): Promise<any> {
    throw new Error('MCPResearchClient is not implemented in this SDK. Use ResearchClient for HTTP API access.');
  }
}

export default { ResearchClient, MCPResearchClient };
