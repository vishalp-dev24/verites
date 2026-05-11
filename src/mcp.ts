/**
 * MCP Server Standalone Entry Point
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { researchService } from './research-service.js';
import { prisma } from './database/client.js';
import { redis } from './redis/client.js';

const modeSchema = z.enum(['lite', 'medium', 'deep']);

const costControlsSchema = z.object({
  max_budget_paise: z.number().positive().optional(),
  quality_threshold: z.number().min(0).max(1).optional(),
  max_iterations: z.number().int().positive().max(10).optional(),
  fallback_mode: modeSchema.optional(),
});

const researchInputSchema = z.object({
  query: z.string().min(1).max(10000),
  mode: modeSchema.default('medium'),
  session_id: z.string().min(1),
  output_schema: z.record(z.unknown()).default({}),
  cost_controls: costControlsSchema.optional(),
});

const estimateInputSchema = z.object({
  query: z.string().min(1).max(10000),
  mode: modeSchema.default('medium'),
  session_id: z.string().min(1),
});

function getMcpContext(): { tenantId: string; apiKeyId: string } {
  const tenantId = process.env.VERITAS_MCP_TENANT_ID;
  const apiKeyId = process.env.VERITAS_MCP_API_KEY_ID || 'mcp-stdio';

  if (!tenantId) {
    throw new Error('VERITAS_MCP_TENANT_ID is required for MCP research tools');
  }

  return { tenantId, apiKeyId };
}

function jsonText(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const server = new Server(
  {
    name: 'veritas',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'research',
      description: 'Run a Veritas research job for a tenant configured by VERITAS_MCP_TENANT_ID.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          mode: { type: 'string', enum: ['lite', 'medium', 'deep'], default: 'medium' },
          session_id: { type: 'string' },
          output_schema: { type: 'object', additionalProperties: true },
          cost_controls: {
            type: 'object',
            properties: {
              max_budget_paise: { type: 'number' },
              quality_threshold: { type: 'number', minimum: 0, maximum: 1 },
              max_iterations: { type: 'integer', minimum: 1, maximum: 10 },
              fallback_mode: { type: 'string', enum: ['lite', 'medium', 'deep'] },
            },
            additionalProperties: false,
          },
        },
        required: ['query', 'session_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'estimate',
      description: 'Estimate Veritas research cost without starting a job.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          mode: { type: 'string', enum: ['lite', 'medium', 'deep'], default: 'medium' },
          session_id: { type: 'string' },
        },
        required: ['query', 'session_id'],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};

  if (request.params.name === 'research') {
    const input = researchInputSchema.parse(args);
    const context = getMcpContext();

    const result = await researchService.submit(
      {
        query: input.query,
        mode: input.mode,
        sessionId: input.session_id,
        outputSchema: input.output_schema,
        costControls: input.cost_controls
          ? {
              maxBudgetPaise: input.cost_controls.max_budget_paise,
              fallbackMode: input.cost_controls.fallback_mode,
              qualityThreshold: input.cost_controls.quality_threshold,
              maxIterations: input.cost_controls.max_iterations,
            }
          : undefined,
      },
      context
    );

    return jsonText(result);
  }

  if (request.params.name === 'estimate') {
    const input = estimateInputSchema.parse(args);
    const estimate = await researchService.estimateCost(input.query, input.mode, input.session_id);
    return jsonText(estimate);
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function shutdown(): Promise<void> {
  await prisma.$disconnect();
  await redis.quit();
}

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
