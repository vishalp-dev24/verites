
/**
 * Research Platform JavaScript SDK
 * 
 * Example:
 * const { ResearchClient } = require('researchplatform');
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

export interface ResearchClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ResearchRequest {
  query: string;
  mode: 'lite' | 'medium' | 'deep';
  sessionId: string;
  outputSchema: Record<string, any>;
  costControls?: {
    maxBudgetPaise?: number;
    fallbackMode?: 'lite' | 'medium' | 'deep';
    qualityThreshold?: number;
    maxIterations?: number;
  };
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
}

export class ResearchClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ResearchClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || 'https://api.researchplatform.com/v1';
  }

  async research(request: ResearchRequest): Promise<ResearchResponse> {
    const response = await axios.post(
      `${this.baseUrl}/research`,
      {
        query: request.query,
        mode: request.mode,
        session_id: request.sessionId,
        output_schema: request.outputSchema,
        cost_controls: request.costControls,
      },
      {
        headers: {
          'X-API-Key': this.apiKey,
        },
        timeout: 300000, // 5 minute timeout
      }
    );

    return this.transformResponse(response.data);
  }

  async getStatus(jobId: string): Promise<ResearchResponse> {
    const response = await axios.get(
      `${this.baseUrl}/research/${jobId}`,
      {
        headers: { 'X-API-Key': this.apiKey },
      }
    );
    return this.transformResponse(response.data);
  }

  async estimateCost(
    query: string,
    mode: 'lite' | 'medium' | 'deep',
    sessionId: string
  ): Promise<{ minPaise: number; maxPaise: number; confidence: number }> {
    const response = await axios.post(
      `${this.baseUrl}/estimate`,
      { query, mode, session_id: sessionId },
      {
        headers: { 'X-API-Key': this.apiKey },
      }
    );

    return {
      minPaise: response.data.min_paise,
      maxPaise: response.data.max_paise,
      confidence: response.data.confidence,
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
      }
    );
    return response.data;
  }

  private transformResponse(data: any): ResearchResponse {
    return {
      jobId: data.job_id,
      sessionId: data.session_id,
      mode: data.mode,
      status: data.status,
      confidenceScore: data.confidence_score,
      data: data.data,
      sources: data.sources || [],
      creditsUsed: data.credits_used,
      trace: data.trace,
    };
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
    // In production, this connects to the MCP server
    // Requires @modelcontextprotocol/sdk
  }

  async research(params: {
    query: string;
    mode: string;
    sessionId: string;
    outputSchema: Record<string, any>;
  }): Promise<any> {
    // Calls MCP tool
    return {
      query: params.query,
      mode: params.mode,
      result: 'MCP research result',
    };
  }
}

export default { ResearchClient, MCPResearchClient };
