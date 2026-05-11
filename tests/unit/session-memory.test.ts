import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionMemory: {
    get: vi.fn(),
    set: vi.fn(),
    appendTopic: vi.fn(),
    appendConclusion: vi.fn(),
    delete: vi.fn(),
  },
  prisma: {
    session: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/redis/client.js', () => ({ sessionMemory: mocks.sessionMemory }));
vi.mock('../../src/database/client.js', () => ({ prisma: mocks.prisma }));

import { SessionMemoryService } from '../../src/session-memory/index.js';

describe('SessionMemoryService tenant isolation', () => {
  let service: SessionMemoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionMemoryService();
    mocks.sessionMemory.get.mockResolvedValue(null);
    mocks.sessionMemory.set.mockResolvedValue(undefined);
    mocks.prisma.session.findFirst.mockResolvedValue(null);
    mocks.prisma.session.create.mockResolvedValue({});
  });

  it('allows the same client session id to exist independently per tenant', async () => {
    await service.getSession('shared-session', 'tenant-a');
    await service.getSession('shared-session', 'tenant-b');

    expect(mocks.prisma.session.findFirst.mock.calls.map(([query]) => query)).toEqual(
      expect.arrayContaining([
        { where: { sessionId: 'shared-session', tenantId: 'tenant-a' } },
        { where: { sessionId: 'shared-session', tenantId: 'tenant-b' } },
      ])
    );
    expect(mocks.prisma.session.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.session.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        sessionId: 'shared-session',
        tenantId: 'tenant-a',
      }),
    });
    expect(mocks.prisma.session.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        sessionId: 'shared-session',
        tenantId: 'tenant-b',
      }),
    });
  });
});
