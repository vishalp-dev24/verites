
/**
 * Express Routes - REST API
 */

import { Router } from 'express';
import { researchService } from '../research-service.js';
import { billingService } from '../billing/index.js';
import { sessionMemoryService } from '../session-memory/index.js';
import { semanticCacheService } from '../blackboard/semantic-cache.js';
import { prisma } from '../database/client.js';

const router = Router();

async function validateApiKey(req: any, res: any, next: any) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const key = await prisma.apiKey.findUnique({
    where: { key },
    include: { tenant: true },
  });

  if (!key || !key.active) return res.status(401).json({ error: 'Invalid API key' });

  req.tenant = key.tenant;
  req.apiKeyId = key.id;
  next();
}

router.post('/v1/research', validateApiKey, async (req, res) => {
  try {
    const result = await researchService.submit(req.body, {
      tenantId: req.tenant.tenantId,
      apiKeyId: req.apiKeyId,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/v1/research/:jobId', validateApiKey, async (req, res) => {
  const job = await researchService.getStatus(req.params.jobId, req.tenant.tenantId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

router.post('/v1/estimate', validateApiKey, async (req, res) => {
  const { query, mode, session_id } = req.body;
  const estimate = await researchService.estimateCost(query, mode, session_id);
  res.json(estimate);
});

router.get('/v1/usage', validateApiKey, async (req, res) => {
  const stats = await billingService.getUsageStats(req.tenant.tenantId);
  res.json(stats);
});

router.get('/v1/sessions/:sessionId', validateApiKey, async (req, res) => {
  const session = await sessionMemoryService.getSession(req.params.sessionId, req.tenant.tenantId);
  res.json(session);
});

router.delete('/v1/sessions/:sessionId', validateApiKey, async (req, res) => {
  await sessionMemoryService.clearSession(req.params.sessionId);
  await semanticCacheService.invalidateTenant(req.tenant.tenantId);
  res.json({ success: true });
});

// Dashboard API Endpoints
router.get('/stats', async (req, res) => {
  try {
    // Get stats across all services
    const [totalJobs, activeJobs, queueLength, cacheStats] = await Promise.all([
      prisma.researchJob.count(),
      prisma.researchJob.count({ where: { status: 'researching' } }),
      0, // Will be: jobQueue.getQueueLength('research'),
      semanticCacheService.getStats(),
    ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const jobsToday = await prisma.researchJob.count({
      where: { createdAt: { gte: startOfDay } },
    });

    // Calculate avg research time from completed jobs
    const completedJobs = await prisma.researchJob.findMany({
      where: { status: 'complete', processingTimeMs: { not: null } },
      select: { processingTimeMs: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    
    const avgResearchTime = completedJobs.length
      ? completedJobs.reduce((sum, j) => sum + (j.processingTimeMs || 0), 0) / completedJobs.length
      : 0;

    res.json({
      total_jobs: totalJobs,
      jobs_today: jobsToday,
      active_jobs: activeJobs,
      credits_remaining: 1240, // Placeholder - integrate with billing
      avg_research_time: Math.round(avgResearchTime),
      queue_length: queueLength,
      cache_hit_rate: cacheStats.hitRate,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.researchJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          jobId: true,
          sessionId: true,
          query: true,
          mode: true,
          status: true,
          confidenceScore: true,
          creditsUsed: true,
          createdAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      prisma.researchJob.count(),
    ]);

    res.json({
      jobs: jobs.map(j => ({
        job_id: j.jobId,
        session_id: j.sessionId,
        query: j.query,
        mode: j.mode,
        status: j.status,
        confidence_score: j.confidenceScore || 0,
        credits_used: j.creditsUsed || 0,
        created_at: j.createdAt.toISOString(),
        completed_at: j.completedAt?.toISOString(),
        error: j.errorMessage || undefined,
      })),
      total,
      page,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/jobs/:jobId', async (req, res) => {
  try {
    const job = await prisma.researchJob.findUnique({
      where: { jobId: req.params.jobId },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      job_id: job.jobId,
      session_id: job.sessionId,
      query: job.query,
      mode: job.mode,
      status: job.status,
      confidence_score: job.confidenceScore || 0,
      credits_used: job.creditsUsed || 0,
      created_at: job.createdAt.toISOString(),
      completed_at: job.completedAt?.toISOString(),
      error: job.errorMessage || undefined,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

router.get('/credits', async (req, res) => {
  try {
    // Placeholder - integrate with billing
    res.json({
      balance: 1240,
      used_this_month: 8760,
      tier: 'pro',
      tier_name: 'Pro',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

router.post('/research', async (req, res) => {
  try {
    const result = await researchService.submit(req.body, {
      tenantId: 'default',
      apiKeyId: 'default',
    });
    res.json({
      job_id: result.jobId,
      status: result.status,
      estimated_time: result.estimatedTime,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed' });
  }
});

router.get('/security/events', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    // In production, query security events from database
    // For now, return empty list
    res.json({
      events: [],
      total: 0,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

router.post('/webhooks/stripe', async (req, res) => {
  await billingService.handleWebhook(req.body);
  res.json({ received: true });
});

export default router;
