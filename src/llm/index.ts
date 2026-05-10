
/**
 * LLM Service
 * OpenAI integration for planning, synthesis, and evaluation
 */

import OpenAI from 'openai';
import { prisma } from '../database/client.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tenantId?: string;
  jobId?: string;
}

export class LLMService {
  private primaryModel = 'gpt-4o-mini';
  private backupModel = 'gpt-3.5-turbo';
  private failovers = 0;
  private lastFailure: number = 0;
  private circuitBreakerOpen = false;

  async generate(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options: LLMOptions = {}
  ): Promise<string> {
    const { model = this.primaryModel } = options;
    
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      if (Date.now() - this.lastFailure < 1200000) { // 20 min
        return this.fallbackGenerate(messages, options);
      }
      this.circuitBreakerOpen = false;
    }

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 2000,
      });

      const content = completion.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Reset failovers on success
      this.failovers = 0;
      
      // Log usage
      await this.logUsage(options, completion.usage);

      return content;
    } catch (error) {
      this.failovers++;
      this.lastFailure = Date.now();
      
      if (this.failovers >= 3) {
        this.circuitBreakerOpen = true;
      }

      // Retry with backup model
      return this.fallbackGenerate(messages, { ...options, model: this.backupModel });
    }
  }

  private async fallbackGenerate(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options: LLMOptions
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: options.model || this.backupModel,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 2000,
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('LLM fallback failed:', error);
      throw new Error('LLM service unavailable');
    }
  }

  private async logUsage(options: LLMOptions, usage: any) {
    if (options.jobId) {
      await prisma.metering.create({
        data: {
          jobId: options.jobId,
          tenantId: options.tenantId || 'system',
          service: 'llm',
          tokens: usage?.total_tokens || 0,
          cost: Math.ceil((usage?.total_tokens || 0) / 1000), // ~1 credit per 1k tokens
          timestamp: new Date(),
        },
      });
    }
  }

  // Planning: break query into tasks
  async planResearch(
    query: string,
    sessionMemory: any
  ): Promise<{ tasks: { id: string; topic: string; scope: string; mustNotOverlap: string[] }[]; estimatedCost: number }> {
    const prompt = `You are a research planner. Break this query into 2-5 sub-tasks.
Query: "${query}"
${sessionMemory ? `Previous context: ${JSON.stringify(sessionMemory)}` : ''}

Return JSON format:
{
  "tasks": [
    { "id": "task_1", "topic": "specific sub-topic", "scope": "what to find", "mustNotOverlap": [] }
  ],
  "estimatedCost": 15
}`;

    const response = await this.generate([{ role: 'user', content: prompt }], { temperature: 0.2 });
    
    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch {
      // Fallback: simple single task
      return {
        tasks: [{ id: 'task_1', topic: query, scope: 'general', mustNotOverlap: [] }],
        estimatedCost: 15,
      };
    }
  }

  // Synthesis: combine worker outputs
  async synthesize(
    query: string,
    findings: any[],
    contradictions: any[],
    outputSchema: any
  ): Promise<any> {
    const prompt = `Synthesize these research findings into a structured response.
Query: "${query}"
Findings: ${JSON.stringify(findings.slice(0, 3))}
Contradictions: ${JSON.stringify(contradictions)}

Output must match this schema: ${JSON.stringify(outputSchema)}

Return only the JSON matching the schema.`;

    const response = await this.generate([{ role: 'user', content: prompt }], { temperature: 0.1 });
    
    try {
      return JSON.parse(response);
    } catch {
      return { summary: response, error: 'Failed to parse structured output' };
    }
  }

  // Evaluation: LLM-as-Judge
  async evaluate(
    query: string,
    result: any,
    sources: any[]
  ): Promise<{ sourceRelevance: number; claimAccuracy: number; overall: number }> {
    const prompt = `Evaluate this research result (1-10 scale).
Query: "${query}"
Result: ${JSON.stringify(result).slice(0, 1000)}
Sources: ${sources.length} sources

Return JSON: {"sourceRelevance": 8, "claimAccuracy": 7, "overall": 7.5}`;

    const response = await this.generate([{ role: 'user', content: prompt }], { temperature: 0 });
    
    try {
      return JSON.parse(response);
    } catch {
      return { sourceRelevance: 7, claimAccuracy: 7, overall: 7 };
    }
  }
}

export const llmService = new LLMService();
