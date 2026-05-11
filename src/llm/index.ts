
/**
 * LLM Service
 * Multi-provider LLM integration (OpenAI, AWS Bedrock) with failover
 */

import OpenAI from 'openai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { prisma } from '../database/client.js';

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// AWS Bedrock client
const bedrock = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

// Provider type
export type LLMProvider = 'openai' | 'bedrock' | 'auto';

export interface LLMOptions {
  model?: string;
  provider?: LLMProvider;
  temperature?: number;
  max_tokens?: number;
  tenantId?: string;
  jobId?: string;
}

// Unified message format
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Provider configurations
interface ProviderConfig {
  name: LLMProvider;
  models: string[];
  defaultModel: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    name: 'openai',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'o1-mini'],
    defaultModel: 'gpt-4o-mini',
  },
  bedrock: {
    name: 'bedrock',
    models: [
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'meta.llama3-1-70b-instruct-v1:0',
      'meta.llama3-1-8b-instruct-v1:0',
      'mistral.mistral-large-2402-v1:0',
    ],
    defaultModel: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  },
};

export class LLMService {
  private primaryProvider: LLMProvider = 'openai';
  private backupProvider: LLMProvider = 'bedrock';
  private failovers = 0;
  private lastFailure: number = 0;
  private circuitBreakerOpen = false;

  /**
   * Main generate method with multi-provider support
   */
  async generate(
    messages: ChatMessage[],
    options: LLMOptions = {}
  ): Promise<string> {
    const provider = options.provider || this.primaryProvider;

    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      if (Date.now() - this.lastFailure < 1200000) { // 20 min
        return this.fallbackGenerate(messages, options);
      }
      this.circuitBreakerOpen = false;
    }

    try {
      let content: string;
      let usage: { total_tokens: number; prompt_tokens: number; completion_tokens: number } | undefined;

      // Route to appropriate provider
      if (provider === 'bedrock' || (provider === 'auto' && bedrock && !options.model?.includes('gpt'))) {
        const result = await this.generateBedrock(messages, options);
        content = result.content;
        usage = result.usage;
      } else {
        // OpenAI as default
        const result = await this.generateOpenAI(messages, options);
        content = result.content;
        usage = result.usage;
      }

      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Reset failovers on success
      this.failovers = 0;

      // Log usage
      await this.logUsage(options, usage);

      return content;
    } catch {
      this.failovers++;
      this.lastFailure = Date.now();

      if (this.failovers >= 3) {
        this.circuitBreakerOpen = true;
      }

      // Retry with backup provider
      console.error(`Primary provider ${provider} failed, trying fallback...`);
      return this.fallbackGenerate(messages, options);
    }
  }

  /**
   * OpenAI generation
   */
  private async generateOpenAI(
    messages: ChatMessage[],
    options: LLMOptions
  ): Promise<{ content: string; usage?: { total_tokens: number; prompt_tokens: number; completion_tokens: number } }> {
    const model = options.model || PROVIDERS.openai.defaultModel;

    const completion = await openai.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 2000,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      usage: {
        total_tokens: completion.usage?.total_tokens || 0,
        prompt_tokens: completion.usage?.prompt_tokens || 0,
        completion_tokens: completion.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * AWS Bedrock generation
   */
  private async generateBedrock(
    messages: ChatMessage[],
    options: LLMOptions
  ): Promise<{ content: string; usage?: { total_tokens: number; prompt_tokens: number; completion_tokens: number } }> {
    if (!bedrock) {
      throw new Error('AWS Bedrock not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    const modelId = options.model || PROVIDERS.bedrock.defaultModel;

    // Format messages based on model provider
    let body: any;

    if (modelId.includes('anthropic')) {
      // Claude format
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };
    } else if (modelId.includes('meta')) {
      // Llama format
      const promptText = this.formatMessagesForLlama(messages);
      body = {
        prompt: promptText,
        max_gen_len: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
      };
    } else if (modelId.includes('mistral')) {
      // Mistral format
      const promptText = this.formatMessagesForMistral(messages);
      body = {
        prompt: promptText,
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
      };
    } else {
      // Default to Claude format
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.max_tokens ?? 2000,
        temperature: options.temperature ?? 0.3,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      };
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Parse response based on model
    let content = '';
    let usage = { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

    if (modelId.includes('anthropic')) {
      content = responseBody.content?.[0]?.text || responseBody.completion || '';
      usage = {
        total_tokens: responseBody.usage?.input_tokens + responseBody.usage?.output_tokens || 0,
        prompt_tokens: responseBody.usage?.input_tokens || 0,
        completion_tokens: responseBody.usage?.output_tokens || 0,
      };
    } else if (modelId.includes('meta')) {
      content = responseBody.generation || '';
      // Llama doesn't return token counts reliably
      usage = {
        total_tokens: (body.prompt?.length || 0) + (content.length || 0),
        prompt_tokens: body.prompt?.length || 0,
        completion_tokens: content.length || 0,
      };
    } else if (modelId.includes('mistral')) {
      content = responseBody.outputs?.[0]?.text || '';
      usage = {
        total_tokens: responseBody.usage?.input_tokens + responseBody.usage?.output_tokens || 0,
        prompt_tokens: responseBody.usage?.input_tokens || 0,
        completion_tokens: responseBody.usage?.output_tokens || 0,
      };
    }

    return { content, usage };
  }

  /**
   * Format messages for Llama models
   */
  private formatMessagesForLlama(messages: ChatMessage[]): string {
    return messages.map(m => {
      if (m.role === 'system') return `<|system|>\n${m.content}`;
      if (m.role === 'user') return `<|user|>\n${m.content}`;
      return `<|assistant|>\n${m.content}`;
    }).join('\n') + '\n<|assistant|>\n';
  }

  /**
   * Format messages for Mistral models
   */
  private formatMessagesForMistral(messages: ChatMessage[]): string {
    return messages.map(m => {
      if (m.role === 'system') return `<s>[INST] ${m.content} [/INST]`;
      if (m.role === 'user') return `[INST] ${m.content} [/INST]`;
      return m.content;
    }).join('\n');
  }

  /**
   * Fallback generation with backup provider
   */
  private async fallbackGenerate(
    messages: ChatMessage[],
    options: LLMOptions
  ): Promise<string> {
    const fallbackProvider = options.provider === 'openai' ? 'bedrock' : 'openai';

    try {
      let result;
      if (fallbackProvider === 'bedrock' && bedrock) {
        result = await this.generateBedrock(messages, { ...options, provider: 'bedrock' });
      } else {
        result = await this.generateOpenAI(messages, { ...options, provider: 'openai' });
      }

      return result.content || '';
    } catch (error) {
      console.error('LLM fallback failed:', error);
      throw new Error('LLM service unavailable - both providers failed');
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
    sessionMemory: any,
    options: LLMOptions = {}
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

    const response = await this.generate([{ role: 'user', content: prompt }], { ...options, temperature: 0.2 });

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
    outputSchema: any,
    options: LLMOptions = {}
  ): Promise<any> {
    const prompt = `Synthesize these research findings into a structured response.
Query: "${query}"
Findings: ${JSON.stringify(findings.slice(0, 3))}
Contradictions: ${JSON.stringify(contradictions)}

Output must match this schema: ${JSON.stringify(outputSchema)}

Return only the JSON matching the schema.`;

    const response = await this.generate([{ role: 'user', content: prompt }], { ...options, temperature: 0.1 });

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
    sources: any[],
    options: LLMOptions = {}
  ): Promise<{ sourceRelevance: number; claimAccuracy: number; overall: number }> {
    const prompt = `Evaluate this research result (1-10 scale).
Query: "${query}"
Result: ${JSON.stringify(result).slice(0, 1000)}
Sources: ${sources.length} sources

Return JSON: {"sourceRelevance": 8, "claimAccuracy": 7, "overall": 7.5}`;

    const response = await this.generate([{ role: 'user', content: prompt }], { ...options, temperature: 0 });

    try {
      return JSON.parse(response);
    } catch {
      return { sourceRelevance: 7, claimAccuracy: 7, overall: 7 };
    }
  }

  /**
   * Helper to select best model based on task complexity
   */
  selectModelForTask(task: 'planning' | 'synthesis' | 'evaluation' | 'quick', provider?: LLMProvider): string {
    if (provider === 'bedrock' || (provider === 'auto' && bedrock)) {
      switch (task) {
        case 'planning':
          return 'anthropic.claude-3-5-sonnet-20241022-v2:0';
        case 'synthesis':
          return 'anthropic.claude-3-5-sonnet-20241022-v2:0';
        case 'evaluation':
          return 'anthropic.claude-3-haiku-20240307-v1:0';
        case 'quick':
          return 'anthropic.claude-3-5-haiku-20241022-v1:0';
        default:
          return PROVIDERS.bedrock.defaultModel;
      }
    }

    // OpenAI models
    switch (task) {
      case 'planning':
        return 'gpt-4o-mini';
      case 'synthesis':
        return 'gpt-4o-mini';
      case 'evaluation':
        return 'gpt-4o-mini';
      case 'quick':
        return 'gpt-3.5-turbo';
      default:
        return PROVIDERS.openai.defaultModel;
    }
  }
}

export const llmService = new LLMService();
