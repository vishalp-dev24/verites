
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

router.post('/webhooks/stripe', async (req, res) => {
  await billingService.handleWebhook(req.body);
  res.json({ received: true });
});

export default router;
