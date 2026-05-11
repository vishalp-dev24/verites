/**
 * API Gateway
 * Front door of the platform
 * - Validates API keys
 * - Enforces per-tenant rate limits
 * - Routes to Orchestrator
 * - Returns typed errors, never raw crashes
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ResearchRequest, ResearchResponse, ResearchMode } from '../types/index.js';

const app = express();
app.use(express.json());

// Request validation schema
const researchRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  mode: z.enum(['lite', 'medium', 'deep']),
  session_id: z.string().min(1),
  output_schema: z.record(z.any()),
  cost_controls: z.object({
    max_budget_paise: z.number().positive(),
    fallback_mode: z.enum(['lite', 'medium', 'deep']),
    on_budget_hit: z.enum(['return_best_available', 'fail_clean', 'notify_and_pause']),
    quality_threshold: z.number().min(0).max(1),
    max_iterations: z.number().positive().max(10),
  }).optional(),
  language: z.string().optional(),
  date_range_days: z.number().positive().optional(),
  domain_whitelist: z.array(z.string()).optional(),
  domain_blacklist: z.array(z.string()).optional(),
  cache: z.boolean().optional(),
  batch: z.array(z.string()).optional(),
  batch_delivery: z.enum(['wait_for_all', 'streaming']).optional(),
});

// Error response type
interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

// Typed error class
class ResearchPlatformError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ResearchPlatformError';
  }
}

// API Key validation middleware
async function validateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({
      error: 'API key required',
      code: 'AUTH_MISSING_KEY',
    } as ApiError);
    return;
  }

  // TODO: Validate against database
  // For now, accept any key for development
  (req as any).tenantId = apiKey.split('_')[1] || 'dev';
  (req as any).apiKey = apiKey;

  next();
}

// Rate limit check middleware
async function checkRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = (req as any).tenantId;

  // TODO: Implement actual rate limiting with Redis
  // For now, allow all requests in development

  next();
}

// Main research endpoint
app.post('/v1/research', validateApiKey, checkRateLimit, async (req: Request, res: Response) => {
  try {
    const validated = researchRequestSchema.parse(req.body);
    const tenantId = (req as any).tenantId;

    // Generate job ID
    const jobId = `res_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Submit to planning layer
    // For now, return immediate response with job handle

    const response: ResearchResponse = {
      job_id: jobId,
      session_id: validated.session_id,
      mode: validated.mode,
      status: 'planning',
      confidence_score: 0,
      quality_achieved: false,
      budget_reached: false,
      data: null,
      sources: [],
      contradictions: [],
      follow_up_queries: [],
      knowledge_gaps: [],
      worker_failures: [],
      trace: {
        plan: {
          job_id: jobId,
          query: validated.query,
          mode: validated.mode,
          tasks: [],
          estimated_cost: {
            min_paise: 0,
            max_paise: 0,
            confidence: 0,
            breakdown: {
              worker_count: 10,
              estimated_sources: 0,
              estimated_iterations: 0,
            },
          },
          created_at: new Date().toISOString(),
          locked: false,
        },
        worker_outcomes: [],
        orchestrator_doubts: [],
        iterations: 0,
        termination_reason: '',
      },
      security_events: [],
      processing_time_ms: 0,
      credits_used: 0,
      cache_hit: false,
    };

    res.status(202).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: { issues: error.issues },
      } as ApiError);
    } else {
      const typedError = error as ResearchPlatformError;
      res.status(500).json({
        error: typedError.message || 'Internal server error',
        code: typedError.code || 'INTERNAL_ERROR',
        details: typedError.details,
      } as ApiError);
    }
  }
});

// Job status endpoint
app.get('/v1/research/:jobId/status', validateApiKey, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  // TODO: Fetch actual status from job queue

  res.json({
    job_id: jobId,
    status: 'planning',
    estimated_completion_ms: 45000,
    stage: 'planning',
    workers_active: 0,
    workers_complete: 0,
  });
});

// SSE stream endpoint for real-time updates
app.get('/v1/research/:jobId/stream', validateApiKey, async (req: Request, res: Response) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ job_id: jobId })}\n\n`);

  // TODO: Subscribe to job updates and stream them
  // For now, just keep connection open

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// MCP Server setup
async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'research-platform',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'research',
          description: 'Execute a research query and return structured results',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Research question or topic',
              },
              mode: {
                type: 'string',
                enum: ['lite', 'medium', 'deep'],
                description: 'Research depth mode',
              },
              session_id: {
                type: 'string',
                description: 'Session ID for memory continuity',
              },
              output_schema: {
                type: 'object',
                description: 'Desired output structure',
              },
            },
            required: ['query', 'mode', 'session_id', 'output_schema'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'research') {
      // TODO: Submit to planning layer
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              job_id: `res_${Date.now()}`,
              status: 'planning',
              message: 'Research job submitted',
            }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});

// Start MCP server in parallel
startMcpServer().catch(console.error);

export { app };
