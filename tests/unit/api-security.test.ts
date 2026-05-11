import express from 'express';
import request from 'supertest';
import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    apiKey: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    researchJob: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    billingEvent: {
      groupBy: vi.fn(),
    },
  },
  researchService: {
    submit: vi.fn(),
    estimateCost: vi.fn(),
    getStatus: vi.fn(),
    cancelJob: vi.fn(),
  },
  sessionMemoryService: {
    getSession: vi.fn(),
    clearSession: vi.fn(),
  },
  billingService: {
    getUsageStats: vi.fn(),
  },
  rateLimiter: {
    isAllowed: vi.fn(),
  },
}));

vi.mock('../../src/database/client.js', () => ({ prisma: mocks.prisma }));
vi.mock('../../src/research-service.js', () => ({ researchService: mocks.researchService }));
vi.mock('../../src/session-memory/index.js', () => ({ sessionMemoryService: mocks.sessionMemoryService }));
vi.mock('../../src/billing/index.js', () => ({ billingService: mocks.billingService }));
vi.mock('../../src/redis/client.js', () => ({ rateLimiter: mocks.rateLimiter }));

import routes from '../../src/api/routes.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalAdminToken = process.env.ADMIN_API_TOKEN;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(routes);
  return app;
}

function mockValidApiKey(apiKey = 'secret-key', permissions = ['read', 'write']) {
  const keyHash = sha256(apiKey);
  mocks.prisma.apiKey.findFirst.mockResolvedValue({
    id: 'api-key-1',
    tenantId: 'tenant-a',
    keyHash,
    isActive: true,
    permissions,
  });
  mocks.prisma.tenant.findUnique.mockResolvedValue({
    tenantId: 'tenant-a',
    isActive: true,
  });
  return keyHash;
}

describe('API trust boundary hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.ADMIN_API_TOKEN;
    mocks.rateLimiter.isAllowed.mockResolvedValue({ allowed: true, remaining: 99 });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_API_TOKEN;
    } else {
      process.env.ADMIN_API_TOKEN = originalAdminToken;
    }
  });

  it('rejects raw keyHash fallback in production', async () => {
    process.env.NODE_ENV = 'production';
    mocks.prisma.apiKey.findFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .get('/v1/usage')
      .set('x-api-key', 'raw-key-that-matches-no-hash');

    expect(response.status).toBe(401);
    expect(mocks.prisma.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('authenticates API keys by SHA-256 hash', async () => {
    const keyHash = mockValidApiKey('secret-key');
    mocks.billingService.getUsageStats.mockResolvedValue({
      creditsUsed: 5,
      creditsBalance: 100,
      requestsThisMonth: 2,
      tier: 'developer',
    });

    const response = await request(createApp())
      .get('/v1/usage')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(mocks.prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: {
        isActive: true,
        keyHash,
      },
    });
  });

  it('requires an admin token for admin routes in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_API_TOKEN = 'admin-secret';

    const unauthenticated = await request(createApp()).get('/admin/stats');
    expect(unauthenticated.status).toBe(401);
    expect(mocks.prisma.researchJob.count).not.toHaveBeenCalled();

    mocks.prisma.researchJob.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3);

    const authenticated = await request(createApp())
      .get('/admin/stats')
      .set('x-admin-token', 'admin-secret');

    expect(authenticated.status).toBe(200);
    expect(authenticated.body).toEqual({
      totalJobs: 10,
      activeJobs: 3,
      queueLength: 0,
    });
  });

  it('requires an admin token when NODE_ENV is unset or staging', async () => {
    process.env.ADMIN_API_TOKEN = 'admin-secret';

    delete process.env.NODE_ENV;
    const unsetEnv = await request(createApp()).get('/admin/stats');
    expect(unsetEnv.status).toBe(401);

    process.env.NODE_ENV = 'staging';
    const staging = await request(createApp()).get('/admin/stats');
    expect(staging.status).toBe(401);

    expect(mocks.prisma.researchJob.count).not.toHaveBeenCalled();
  });

  it('applies authenticated rate limits by API key record id, not raw key material', async () => {
    mockValidApiKey('secret-key');
    mocks.rateLimiter.isAllowed.mockResolvedValue({ allowed: false, remaining: 0 });

    const response = await request(createApp())
      .get('/v1/usage')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(429);
    expect(mocks.rateLimiter.isAllowed).toHaveBeenCalledWith('api-key:api-key-1', 100, 60);
    expect(mocks.billingService.getUsageStats).not.toHaveBeenCalled();
  });

  it('rejects invalid research request bodies before submission', async () => {
    mockValidApiKey();

    const response = await request(createApp())
      .post('/v1/research')
      .set('x-api-key', 'secret-key')
      .send({
        mode: 'lite',
        session_id: 'session-1',
        output_schema: {},
      });

    expect(response.status).toBe(400);
    expect(mocks.researchService.submit).not.toHaveBeenCalled();
  });

  it('normalizes valid research request bodies for the research service', async () => {
    mockValidApiKey();
    mocks.researchService.submit.mockResolvedValue({
      job_id: 'res_1',
      status: 'success',
    });

    const response = await request(createApp())
      .post('/v1/research')
      .set('x-api-key', 'secret-key')
      .send({
        query: '  verify this market claim  ',
        mode: 'medium',
        session_id: 'session-1',
        output_schema: {},
        cost_controls: {
          max_budget_paise: 5000,
          quality_threshold: 0.8,
          max_iterations: 3,
        },
      });

    expect(response.status).toBe(200);
    expect(mocks.researchService.submit).toHaveBeenCalledWith({
      query: 'verify this market claim',
      mode: 'medium',
      sessionId: 'session-1',
      outputSchema: {},
      costControls: {
        maxBudgetPaise: 5000,
        fallbackMode: undefined,
        qualityThreshold: 0.8,
        maxIterations: 3,
      },
    }, {
      tenantId: 'tenant-a',
      apiKeyId: 'api-key-1',
    });
  });

  it('rejects write routes for read-only API keys', async () => {
    mockValidApiKey('secret-key', ['read']);

    const response = await request(createApp())
      .post('/v1/research')
      .set('x-api-key', 'secret-key')
      .send({
        query: 'verify this',
        mode: 'lite',
        session_id: 'session-1',
        output_schema: {},
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('write permission required');
    expect(mocks.researchService.submit).not.toHaveBeenCalled();
  });

  it('rejects unsupported research request fields instead of accepting fake API contract', async () => {
    mockValidApiKey();

    const response = await request(createApp())
      .post('/v1/research')
      .set('x-api-key', 'secret-key')
      .send({
        query: 'verify this',
        mode: 'lite',
        session_id: 'session-1',
        output_schema: {},
        language: 'en',
      });

    expect(response.status).toBe(400);
    expect(mocks.researchService.submit).not.toHaveBeenCalled();
  });

  it('lists only jobs for the authenticated tenant', async () => {
    mockValidApiKey();
    const createdAt = new Date('2026-05-11T10:00:00.000Z');
    mocks.prisma.researchJob.findMany.mockResolvedValue([
      {
        jobId: 'res_1',
        sessionId: 'session-1',
        query: 'tenant scoped job',
        mode: 'medium',
        status: 'success',
        confidenceScore: 0.9,
        qualityAchieved: true,
        budgetReached: false,
        data: { result: { summary: 'tenant scoped final answer' }, billing: { creditsReserved: 10 } },
        response: { summary: 'tenant scoped final answer' },
        sources: [],
        contradictions: [],
        followUpQueries: [],
        knowledgeGaps: [],
        creditsUsed: 25,
        processingTimeMs: null,
        processingTime: 1200,
        createdAt,
        completedAt: createdAt,
        errorMessage: null,
      },
    ]);
    mocks.prisma.researchJob.count.mockResolvedValue(1);

    const response = await request(createApp())
      .get('/v1/jobs')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(mocks.prisma.researchJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a' },
    }));
    expect(response.body.jobs).toHaveLength(1);
    expect(response.body.jobs[0]).toMatchObject({
      job_id: 'res_1',
      session_id: 'session-1',
      query: 'tenant scoped job',
      credits_used: 25,
      data: { summary: 'tenant scoped final answer' },
    });
  });

  it('cancels only cancellable jobs for the authenticated tenant', async () => {
    mockValidApiKey();
    mocks.researchService.cancelJob.mockResolvedValue(true);

    const response = await request(createApp())
      .post('/v1/jobs/res_1/cancel')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(mocks.researchService.cancelJob).toHaveBeenCalledWith('res_1', 'tenant-a');
  });

  it('lists API keys for the authenticated tenant without exposing hashes', async () => {
    mockValidApiKey();
    const createdAt = new Date('2026-05-11T10:00:00.000Z');
    mocks.prisma.apiKey.findMany.mockResolvedValue([
      {
        keyId: 'key_visible',
        tenantId: 'tenant-a',
        name: 'Production',
        keyHash: 'secret-hash',
        isActive: true,
        createdAt,
        lastUsedAt: null,
      },
    ]);

    const response = await request(createApp())
      .get('/v1/api-keys')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(mocks.prisma.apiKey.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      orderBy: { createdAt: 'desc' },
    });
    expect(response.body[0]).toMatchObject({
      id: 'key_visible',
      name: 'Production',
      status: 'active',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-hash');
  });

  it('creates tenant API keys as hashes and returns the full key once', async () => {
    mockValidApiKey();
    const createdAt = new Date('2026-05-11T10:00:00.000Z');
    mocks.prisma.apiKey.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt,
      lastUsedAt: null,
      isActive: true,
    }));

    const response = await request(createApp())
      .post('/v1/api-keys')
      .set('x-api-key', 'secret-key')
      .send({ name: 'Production' });

    expect(response.status).toBe(201);
    const createCall = mocks.prisma.apiKey.create.mock.calls[0][0];
    expect(createCall.data.tenantId).toBe('tenant-a');
    expect(createCall.data.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.keyHash).not.toBe(response.body.full_key);
    expect(response.body.full_key).toMatch(/^vts_/);
  });

  it('revokes only API keys owned by the authenticated tenant', async () => {
    mockValidApiKey();
    mocks.prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp())
      .delete('/v1/api-keys/key_visible')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(204);
    expect(mocks.prisma.apiKey.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-a',
        keyId: 'key_visible',
        isActive: true,
      },
    }));
  });

  it('returns usage breakdown from tenant billing events', async () => {
    mockValidApiKey();
    mocks.prisma.billingEvent.groupBy.mockResolvedValue([
      {
        mode: 'medium',
        _count: { _all: 2 },
        _sum: { creditsUsed: 50 },
      },
    ]);

    const response = await request(createApp())
      .get('/v1/usage/breakdown?days=30')
      .set('x-api-key', 'secret-key');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      mode: 'medium',
      requests: 2,
      credits_used: 50,
      avg_credits_per_request: 25,
    }]);
  });
});
