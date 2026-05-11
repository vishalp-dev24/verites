import { Router, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z, ZodError } from 'zod';
import { researchService } from '../research-service.js';
import type { ResearchRequest } from '../research-service.js';
import { sessionMemoryService } from '../session-memory/index.js';
import { prisma } from '../database/client.js';
import { billingService } from '../billing/index.js';
import { rateLimiter } from '../redis/client.js';

const router = Router();

const modeSchema = z.enum(['lite', 'medium', 'deep']);
const sessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'session_id contains invalid characters');

const costControlsSchema = z.object({
  max_budget_paise: z.number().int().positive().max(10_000_000).optional(),
  fallback_mode: modeSchema.optional(),
  quality_threshold: z.number().min(0).max(1).optional(),
  max_iterations: z.number().int().min(1).max(10).optional(),
}).strict();

const researchRequestSchema = z.object({
  query: z.string().trim().min(1).max(10_000),
  mode: modeSchema,
  session_id: sessionIdSchema,
  output_schema: z.record(z.unknown()).default({}),
  cost_controls: costControlsSchema.optional(),
}).strict();

const estimateRequestSchema = z.object({
  query: z.string().trim().min(1).max(10_000),
  mode: modeSchema,
  session_id: sessionIdSchema,
}).strict();

const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permissions: z.array(z.enum(['read', 'write'])).max(2).default(['read', 'write']),
}).strict();

// Extend Express Request to include custom properties
declare global {
  namespace Express {
    interface Request {
      tenant?: any;
      apiKeyId?: string;
      apiKeyPermissions?: string[];
    }
  }
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey(): string {
  return `vts_${randomBytes(32).toString('base64url')}`;
}

function generateKeyId(): string {
  return `key_${randomBytes(12).toString('hex')}`;
}

function getHeaderValue(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(req: Request): string | undefined {
  const authorization = getHeaderValue(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) return undefined;
  return authorization.slice('Bearer '.length).trim();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function handleValidationError(res: Response, error: unknown): boolean {
  if (!(error instanceof ZodError)) return false;
  res.status(400).json({
    error: 'Invalid request body',
    details: error.flatten().fieldErrors,
  });
  return true;
}

function toResearchRequest(input: z.infer<typeof researchRequestSchema>): ResearchRequest {
  return {
    query: input.query,
    mode: input.mode,
    sessionId: input.session_id,
    outputSchema: input.output_schema,
    costControls: input.cost_controls ? {
      maxBudgetPaise: input.cost_controls.max_budget_paise,
      fallbackMode: input.cost_controls.fallback_mode,
      qualityThreshold: input.cost_controls.quality_threshold,
      maxIterations: input.cost_controls.max_iterations,
    } : undefined,
  };
}

function serializeResearchJob(job: any) {
  const jobData = job.data && typeof job.data === 'object' && !Array.isArray(job.data)
    ? job.data
    : {};
  const finalData = job.response ?? jobData.result ?? job.data;

  return {
    job_id: job.jobId,
    session_id: job.sessionId,
    query: job.query,
    mode: job.mode,
    status: job.status,
    confidence_score: job.confidenceScore,
    quality_achieved: job.qualityAchieved,
    budget_reached: job.budgetReached,
    data: finalData,
    sources: job.sources,
    contradictions: job.contradictions,
    follow_up_queries: job.followUpQueries,
    knowledge_gaps: job.knowledgeGaps,
    credits_used: job.creditsUsed ?? 0,
    processing_time_ms: job.processingTimeMs ?? job.processingTime,
    created_at: job.createdAt,
    completed_at: job.completedAt,
    error: job.errorMessage,
  };
}

function serializeApiKey(key: any) {
  return {
    id: key.keyId,
    name: key.name || key.keyId,
    key_preview: `${key.keyId.slice(0, 10)}...`,
    created_at: key.createdAt,
    last_used_at: key.lastUsedAt,
    usage_count: 0,
    status: key.isActive ? 'active' : 'revoked',
    permissions: Array.isArray(key.permissions) ? key.permissions : ['read', 'write'],
  };
}

function requirePermission(permission: 'read' | 'write') {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = req.apiKeyPermissions || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: `${permission} permission required` });
    }
    next();
  };
}

function normalizeSecurityEvent(event: any, job: any) {
  return {
    id: String(event?.id || `${job.jobId}_${job.createdAt?.getTime?.() || Date.now()}`),
    type: String(event?.type || 'research_security_event'),
    risk_score: Number.isFinite(Number(event?.risk_score)) ? Number(event.risk_score) : 0,
    source_url: typeof event?.source_url === 'string' ? event.source_url : undefined,
    action: ['blocked', 'quarantined', 'allowed', 'flagged'].includes(event?.action)
      ? event.action
      : 'flagged',
    timestamp: typeof event?.timestamp === 'string'
      ? event.timestamp
      : (job.createdAt instanceof Date ? job.createdAt.toISOString() : new Date().toISOString()),
    details: typeof event === 'object' && event ? event : { job_id: job.jobId },
  };
}

function backendStatusFilter(status: string): any {
  switch (status) {
    case 'complete':
      return { in: ['success', 'complete', 'completed', 'partial'] };
    case 'processing':
      return { in: ['processing', 'researching', 'running'] };
    case 'queued':
      return { in: ['queued', 'planning'] };
    case 'failed':
      return { in: ['failed', 'error', 'rejected'] };
    case 'pending':
    case 'cancelled':
      return status;
    default:
      return undefined;
  }
}

async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = getHeaderValue(req, 'x-api-key') || getBearerToken(req);
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (apiKey.length > 1024) return res.status(401).json({ error: 'Invalid API key' });

  const apiKeyHash = hashApiKey(apiKey);
  let keyRecord = await prisma.apiKey.findFirst({
    where: {
      isActive: true,
      keyHash: apiKeyHash,
    },
  });

  if (keyRecord && !constantTimeEqual(apiKeyHash, keyRecord.keyHash)) {
    keyRecord = null;
  }

  if (!keyRecord && process.env.ALLOW_LEGACY_RAW_API_KEYS === 'true' && process.env.NODE_ENV !== 'production') {
    const keys = await prisma.apiKey.findMany({
      where: { isActive: true },
    });
    keyRecord = keys.find(k => constantTimeEqual(apiKey, k.keyHash)) || null;
  }

  if (!keyRecord || !keyRecord.isActive) return res.status(401).json({ error: 'Invalid API key' });

  // Get tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: keyRecord.tenantId },
  });

  if (!tenant) return res.status(401).json({ error: 'Tenant not found' });
  if (!tenant.isActive) return res.status(403).json({ error: 'Tenant suspended' });

  req.tenant = tenant;
  req.apiKeyId = keyRecord.id;
  req.apiKeyPermissions = Array.isArray((keyRecord as any).permissions)
    ? (keyRecord as any).permissions
    : ['read', 'write'];

  const maxRequests = Number.parseInt(process.env.MAX_AUTHENTICATED_REQUESTS_PER_MINUTE || '100', 10);
  const limit = await rateLimiter.isAllowed(`api-key:${keyRecord.id}`, maxRequests, 60);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retry_after: 60,
    });
  }

  next();
}

function validateAdminAccess(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) return res.status(404).json({ error: 'Not found' });

  const suppliedToken = getHeaderValue(req, 'x-admin-token') || getBearerToken(req);
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }

  next();
}

router.post('/v1/research', validateApiKey, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const body = researchRequestSchema.parse(req.body);
    const result = await researchService.submit(toResearchRequest(body), {
      tenantId: req.tenant!.tenantId,
      apiKeyId: req.apiKeyId!,
    });
    if ((result as any).status === 'rejected' && (result as any).reason === 'insufficient_credits') {
      return res.status(402).json(result);
    }
    res.json(result);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    const status = error instanceof Error && error.message === 'Insufficient credits' ? 402 : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/v1/research/:jobId', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const job = await researchService.getStatus(req.params.jobId, req.tenant!.tenantId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

router.post('/v1/estimate', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  try {
    const { query, mode, session_id } = estimateRequestSchema.parse(req.body);
    const estimate = await researchService.estimateCost(query, mode, session_id);
    res.json(estimate);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/v1/usage', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const stats = await billingService.getUsageStats(req.tenant!.tenantId);
  res.json(stats);
});

router.get('/v1/usage/breakdown', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, Number.parseInt(String(req.query.days || '30'), 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.billingEvent.groupBy({
    by: ['mode'],
    where: {
      tenantId: req.tenant!.tenantId,
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { creditsUsed: true },
  });

  res.json(rows.map((row) => {
    const requests = row._count._all;
    const creditsUsed = row._sum.creditsUsed ?? 0;
    return {
      mode: row.mode,
      requests,
      credits_used: creditsUsed,
      avg_credits_per_request: requests > 0 ? creditsUsed / requests : 0,
    };
  }));
});

router.get('/v1/security/events', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
  const jobs = await prisma.researchJob.findMany({
    where: { tenantId: req.tenant!.tenantId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(500, page * limit * 5),
    select: {
      jobId: true,
      createdAt: true,
      securityEvents: true,
    },
  });

  const events = jobs.flatMap((job) => {
    const rawEvents = Array.isArray(job.securityEvents) ? job.securityEvents : [];
    return rawEvents.map((event) => normalizeSecurityEvent(event, job));
  });
  const start = (page - 1) * limit;

  res.json({
    events: events.slice(start, start + limit),
    total: events.length,
  });
});

router.get('/v1/api-keys', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId: req.tenant!.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(keys.map(serializeApiKey));
});

router.post('/v1/api-keys', validateApiKey, requirePermission('write'), async (req: Request, res: Response) => {
  try {
    const body = apiKeyCreateSchema.parse(req.body);
    const fullKey = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        keyId: generateKeyId(),
        tenantId: req.tenant!.tenantId,
        keyHash: hashApiKey(fullKey),
        name: body.name,
        permissions: body.permissions,
      },
    });

    res.status(201).json({
      ...serializeApiKey(key),
      full_key: fullKey,
      permissions: body.permissions,
    });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.delete('/v1/api-keys/:keyId', validateApiKey, requirePermission('write'), async (req: Request, res: Response) => {
  const updated = await prisma.apiKey.updateMany({
    where: {
      tenantId: req.tenant!.tenantId,
      keyId: req.params.keyId,
      isActive: true,
    },
    data: {
      isActive: false,
      suspendedAt: new Date(),
      suspensionReason: 'revoked_by_tenant',
    },
  });

  if (updated.count !== 1) return res.status(404).json({ error: 'API key not found' });
  res.status(204).send();
});

router.get('/v1/stats', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalJobs,
    jobsToday,
    activeJobs,
    cacheHits,
    completedJobs,
    avgProcessing,
    activeSessions,
  ] = await Promise.all([
    prisma.researchJob.count({ where: { tenantId } }),
    prisma.researchJob.count({ where: { tenantId, createdAt: { gte: startOfDay } } }),
    prisma.researchJob.count({
      where: {
        tenantId,
        status: { in: ['pending', 'queued', 'planning', 'processing', 'researching'] },
      },
    }),
    prisma.researchJob.count({ where: { tenantId, cacheHit: true } }),
    prisma.researchJob.count({ where: { tenantId, status: { in: ['success', 'complete', 'completed', 'partial'] } } }),
    prisma.researchJob.aggregate({
      where: { tenantId, processingTime: { not: null } },
      _avg: { processingTime: true },
    }),
    prisma.researchJob.findMany({
      where: { tenantId },
      distinct: ['sessionId'],
      select: { sessionId: true },
    }),
  ]);

  res.json({
    totalJobs,
    jobsToday,
    activeJobs,
    queueLength: activeJobs,
    creditsRemaining: req.tenant!.creditsBalance ?? 0,
    creditsUsedThisMonth: req.tenant!.creditsUsed ?? 0,
    avgResearchTime: Math.round((avgProcessing._avg.processingTime ?? 0) / 1000),
    cacheHitRate: totalJobs > 0 ? cacheHits / totalJobs : 0,
    activeSessions: activeSessions.length,
    completedJobs,
  });
});

router.get('/v1/jobs', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const tenantId = req.tenant!.tenantId;
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where: any = { tenantId };

  const statusFilter = rawStatus && rawStatus !== 'all' ? backendStatusFilter(rawStatus) : undefined;
  if (statusFilter) {
    where.status = statusFilter;
  }

  const [jobs, total] = await Promise.all([
    prisma.researchJob.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.researchJob.count({ where }),
  ]);

  res.json({
    jobs: jobs.map(serializeResearchJob),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.post('/v1/jobs/:jobId/cancel', validateApiKey, requirePermission('write'), async (req: Request, res: Response) => {
  const cancelled = await researchService.cancelJob(req.params.jobId, req.tenant!.tenantId);
  if (!cancelled) return res.status(404).json({ error: 'Cancellable job not found' });
  res.json({ cancelled: true });
});

// Session endpoints
router.get('/v1/session/:sessionId', validateApiKey, requirePermission('read'), async (req: Request, res: Response) => {
  const session = await sessionMemoryService.getSession(
    req.params.sessionId,
    req.tenant!.tenantId
  );
  res.json(session);
});

router.post('/v1/session/:sessionId/clear', validateApiKey, requirePermission('write'), async (req: Request, res: Response) => {
  await sessionMemoryService.clearSession(
    req.params.sessionId,
    req.tenant!.tenantId
  );
  res.json({ cleared: true });
});

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin routes always require an explicit token. Misconfigured environments must fail closed.
router.get('/admin/stats', validateAdminAccess, async (_req: Request, res: Response) => {
  const [
    totalJobs,
    activeJobs,
    queueLength,
  ] = await Promise.all([
    prisma.researchJob.count(),
    prisma.researchJob.count({ where: { status: 'researching' } }),
    0, // Placeholder for queue length
  ]);

  res.json({
    totalJobs,
    activeJobs,
    queueLength,
  });
});

router.get('/admin/jobs', validateAdminAccess, async (_req: Request, res: Response) => {
  const jobs = await prisma.researchJob.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  res.json(jobs);
});

router.post('/admin/research', validateAdminAccess, async (req: Request, res: Response) => {
  // Direct research endpoint for local testing and authenticated production admin use.
  try {
    const body = researchRequestSchema.parse(req.body);
    const result = await researchService.submit(toResearchRequest(body), {
      tenantId: 'admin',
      apiKeyId: 'admin-key',
    });
    res.json({
      job_id: (result as any).job_id,
      session_id: (result as any).session_id,
      tenant_id: 'admin',
      status: (result as any).status,
      message: 'Processing...',
      check_url: `/v1/research/${(result as any).job_id}`,
    });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    console.error('Research error:', error);
    const status = error instanceof Error && error.message === 'Insufficient credits' ? 402 : 500;
    res.status(status).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

export default router;
