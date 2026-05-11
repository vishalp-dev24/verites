import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tx: {
    tenant: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    billingEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    researchJob: {
      updateMany: vi.fn(),
    },
  },
  prisma: {
    tenant: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    billingEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    researchJob: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/database/client.js', () => ({ prisma: mocks.prisma }));

import { BillingService } from '../../src/billing/index.js';

describe('BillingService credit reservations', () => {
  let service: BillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BillingService();
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<void>) => {
      await callback(mocks.tx);
    });
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      tenantId: 'tenant-a',
      creditsBalance: 100,
      tier: 'developer',
    });
    mocks.tx.researchJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it('reserves credits with an atomic balance guard', async () => {
    mocks.prisma.tenant.updateMany.mockResolvedValue({ count: 1 });

    await service.reserveCredits({
      jobId: 'res_1',
      tenantId: 'tenant-a',
      mode: 'medium',
      workersUsed: 5,
      iterations: 3,
      creditsReserved: 50,
    });

    expect(mocks.prisma.tenant.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        creditsBalance: { gte: 50 },
      },
      data: {
        creditsBalance: { decrement: 50 },
      },
    });
  });

  it('rejects a reservation when the guarded debit does not update a tenant', async () => {
    mocks.prisma.tenant.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.reserveCredits({
      jobId: 'res_1',
      tenantId: 'tenant-a',
      mode: 'medium',
      workersUsed: 5,
      iterations: 3,
      creditsReserved: 50,
    })).rejects.toThrow('Insufficient credits');
  });

  it('refunds unused reserved credits and records actual usage on finalization', async () => {
    mocks.tx.tenant.update.mockResolvedValue({});
    mocks.tx.billingEvent.createMany.mockResolvedValue({ count: 1 });

    await service.finalizeCreditReservation({
      jobId: 'res_1',
      tenantId: 'tenant-a',
      mode: 'medium',
      workersUsed: 5,
      iterations: 2,
      creditsReserved: 50,
      creditsUsed: 35,
    });

    expect(mocks.tx.tenant.update).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      data: {
        creditsBalance: { increment: 15 },
        creditsUsed: { increment: 35 },
      },
    });
    expect(mocks.tx.billingEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-a',
        jobId: 'res_1',
        mode: 'medium',
        workersUsed: 5,
        iterations: 2,
        creditsUsed: 35,
      })],
      skipDuplicates: true,
    });
    expect(mocks.tx.researchJob.updateMany).toHaveBeenCalledWith({
      where: {
        jobId: 'res_1',
        tenantId: 'tenant-a',
        billingFinalizedAt: null,
        reservationReleasedAt: null,
      },
      data: {
        billingFinalizedAt: expect.any(Date),
      },
    });
  });

  it('does not double charge an already-finalized job reservation', async () => {
    mocks.tx.researchJob.updateMany.mockResolvedValue({ count: 0 });

    await service.finalizeCreditReservation({
      jobId: 'res_1',
      tenantId: 'tenant-a',
      mode: 'medium',
      workersUsed: 5,
      iterations: 2,
      creditsReserved: 50,
      creditsUsed: 35,
    });

    expect(mocks.tx.tenant.update).not.toHaveBeenCalled();
    expect(mocks.tx.tenant.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.billingEvent.createMany).not.toHaveBeenCalled();
  });

  it('releases a failed job reservation only once', async () => {
    mocks.tx.researchJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.tenant.update.mockResolvedValue({});

    await service.releaseCreditReservationForJob('res_1', 'tenant-a', 50);

    expect(mocks.tx.researchJob.updateMany).toHaveBeenCalledWith({
      where: {
        jobId: 'res_1',
        tenantId: 'tenant-a',
        billingFinalizedAt: null,
        reservationReleasedAt: null,
      },
      data: {
        reservationReleasedAt: expect.any(Date),
      },
    });
    expect(mocks.tx.tenant.update).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      data: {
        creditsBalance: { increment: 50 },
      },
    });
  });

  it('does not over-refund an already-released job reservation', async () => {
    mocks.tx.researchJob.updateMany.mockResolvedValue({ count: 0 });

    await service.releaseCreditReservationForJob('res_1', 'tenant-a', 50);

    expect(mocks.tx.tenant.update).not.toHaveBeenCalled();
  });
});
