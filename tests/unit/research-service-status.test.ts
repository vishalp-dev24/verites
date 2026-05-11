import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    researchJob: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/database/client.js', () => ({ prisma: mocks.prisma }));
vi.mock('../../src/llm/index.js', () => ({ llmService: {} }));
vi.mock('../../src/worker-fleet/executor.js', () => ({ workerFleet: {} }));
vi.mock('../../src/orchestrator/index.js', () => ({ orchestratorExecutor: {} }));
vi.mock('../../src/session-memory/index.js', () => ({ sessionMemoryService: {} }));
vi.mock('../../src/billing/index.js', () => ({ billingService: {} }));
vi.mock('../../src/formatter/index.js', () => ({ formatter: {} }));
vi.mock('../../src/security/index.js', () => ({ securityService: {} }));

import { ResearchService } from '../../src/research-service.js';

describe('ResearchService status contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns terminal failure error and completion timestamp', async () => {
    const completedAt = new Date('2026-05-11T10:00:05.000Z');
    mocks.prisma.researchJob.findFirst.mockResolvedValue({
      jobId: 'res_failed',
      sessionId: 'session-1',
      mode: 'medium',
      status: 'failed',
      confidenceScore: null,
      qualityAchieved: null,
      budgetReached: null,
      response: null,
      data: {},
      sources: [],
      contradictions: [],
      followUpQueries: [],
      knowledgeGaps: [],
      creditsUsed: 0,
      processingTimeMs: null,
      processingTime: 5000,
      createdAt: new Date('2026-05-11T10:00:00.000Z'),
      completedAt,
      errorMessage: 'Formatter failed schema validation',
    });

    const service = new ResearchService();
    const result = await service.getStatus('res_failed', 'tenant-a');

    expect(result).toMatchObject({
      job_id: 'res_failed',
      status: 'failed',
      error: 'Formatter failed schema validation',
      completed_at: completedAt,
    });
  });

  it('keeps the worker loop alive after startup database errors', async () => {
    vi.useFakeTimers();
    mocks.prisma.researchJob.updateMany
      .mockRejectedValueOnce(new Error('relation "research_jobs" does not exist'))
      .mockResolvedValue({ count: 0 });
    mocks.prisma.researchJob.findFirst.mockResolvedValue(null);

    const service = new ResearchService();
    service.startWorker();

    await vi.waitFor(() => {
      expect(mocks.prisma.researchJob.updateMany).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => {
      expect(mocks.prisma.researchJob.updateMany).toHaveBeenCalledTimes(2);
    });

    service.stopWorker();
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
  });
});
