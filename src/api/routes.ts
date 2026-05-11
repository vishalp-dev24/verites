import { Router, Request, Response, NextFunction } from 'express';
import { researchService } from '../research-service.js';
import { sessionMemoryService } from '../session-memory/index.js';
import { prisma } from '../database/client.js';
import { billingService } from '../billing/index.js';

const router = Router();

// Extend Express Request to include custom properties
declare global {
  namespace Express {
    interface Request {
      tenant?: any;
      apiKeyId?: string;
    }
  }
}

async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  // Find API key by hash (in production, hash the key first)
  const keys = await prisma.apiKey.findMany({
    where: { isActive: true },
  });
  
  const keyRecord = keys.find(k => k.keyHash === apiKey);

  if (!keyRecord || !keyRecord.isActive) return res.status(401).json({ error: 'Invalid API key' });

  // Get tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: keyRecord.tenantId },
  });

  if (!tenant) return res.status(401).json({ error: 'Tenant not found' });

  req.tenant = tenant;
  req.apiKeyId = keyRecord.id;
  next();
}

router.post('/v1/research', validateApiKey, async (req: Request, res: Response) => {
  try {
    const result = await researchService.submit(req.body, {
      tenantId: req.tenant!.tenantId,
      apiKeyId: req.apiKeyId!,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/v1/research/:jobId', validateApiKey, async (req: Request, res: Response) => {
  const job = await researchService.getStatus(req.params.jobId, req.tenant!.tenantId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

router.post('/v1/estimate', validateApiKey, async (req: Request, res: Response) => {
  const { query, mode, session_id } = req.body;
  const estimate = await researchService.estimateCost(query, mode, session_id);
  res.json(estimate);
});

router.get('/v1/usage', validateApiKey, async (req: Request, res: Response) => {
  const stats = await billingService.getUsageStats(req.tenant!.tenantId);
  res.json(stats);
});

// Session endpoints
router.get('/v1/session/:sessionId', validateApiKey, async (req: Request, res: Response) => {
  const session = await sessionMemoryService.getSession(
    req.params.sessionId,
    req.tenant!.tenantId
  );
  res.json(session);
});

router.post('/v1/session/:sessionId/clear', validateApiKey, async (req: Request, res: Response) => {
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

// Admin routes (no auth for dev)
router.get('/admin/stats', async (_req: Request, res: Response) => {
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

router.get('/admin/jobs', async (_req: Request, res: Response) => {
  const jobs = await prisma.researchJob.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });

  res.json(jobs);
});

router.post('/admin/research', async (req: Request, res: Response) => {
  // Direct research endpoint without auth (for testing)
  try {
    const result = await researchService.submit(req.body, {
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
    console.error('Research error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

export default router;
