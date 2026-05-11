import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_INITIAL_FREE_CREDITS,
  MIN_LITE_RESEARCH_CREDITS,
  bootstrapFirstTenant,
  hashApiKey,
  resolveBootstrapOptions,
} from '../../prisma/bootstrap.mjs';

function createPrismaMock({
  tenant = null,
  existingKey = null,
}: {
  tenant?: any;
  existingKey?: any;
} = {}) {
  return {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(tenant),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'tenant-row-1',
        ...data,
      })),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...tenant,
        ...data,
      })),
    },
    apiKey: {
      findFirst: vi.fn().mockResolvedValue(existingKey),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'api-key-row-1',
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
        lastUsedAt: null,
        isActive: true,
        ...data,
      })),
    },
  };
}

describe('Prisma tenant bootstrap', () => {
  it('creates a first free tenant with enough credits and stores only a hashed API key', async () => {
    const prisma = createPrismaMock();

    const result = await bootstrapFirstTenant({
      prisma,
      env: {
        NODE_ENV: 'production',
        BOOTSTRAP_TENANT_EMAIL: 'ops@example.com',
      },
      argv: ['--tenant-id', 'tenant_acme', '--name', 'Acme'],
    });

    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_acme',
        name: 'Acme',
        email: 'ops@example.com',
        tier: 'free',
        creditsBalance: DEFAULT_INITIAL_FREE_CREDITS,
        creditsUsed: 0,
        isActive: true,
      }),
    });
    expect(result.tenant.credits_balance).toBeGreaterThanOrEqual(MIN_LITE_RESEARCH_CREDITS);

    const apiKeyCreate = prisma.apiKey.create.mock.calls[0][0];
    expect(apiKeyCreate.data.keyHash).toBe(hashApiKey(result.api_key.full_key));
    expect(apiKeyCreate.data.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(apiKeyCreate.data.keyHash).not.toBe(result.api_key.full_key);
    expect(result.api_key.full_key).toMatch(/^vts_/);
    expect(JSON.stringify(result)).not.toContain(apiKeyCreate.data.keyHash);
  });

  it('does not create or reveal a raw key when an active key already exists', async () => {
    const prisma = createPrismaMock({
      tenant: {
        tenantId: 'tenant_acme',
        name: 'Acme',
        email: 'ops@example.com',
        tier: 'free',
        creditsBalance: DEFAULT_INITIAL_FREE_CREDITS,
        creditsUsed: 0,
        isActive: true,
      },
      existingKey: {
        keyId: 'key_existing',
        tenantId: 'tenant_acme',
        isActive: true,
      },
    });

    const result = await bootstrapFirstTenant({
      prisma,
      env: {},
      argv: ['--tenant-id', 'tenant_acme'],
    });

    expect(prisma.apiKey.create).not.toHaveBeenCalled();
    expect(result.api_key).toEqual(expect.objectContaining({
      created: false,
      existing_key_id: 'key_existing',
      raw_key_recoverable: false,
    }));
    expect(result.api_key).not.toHaveProperty('full_key');
  });

  it('tops up a previously bootstrapped unused free tenant that had the old zero-credit default', async () => {
    const prisma = createPrismaMock({
      tenant: {
        tenantId: 'tenant_acme',
        name: 'Acme',
        email: 'ops@example.com',
        tier: 'free',
        creditsBalance: 0,
        creditsUsed: 0,
        isActive: true,
      },
    });

    const result = await bootstrapFirstTenant({
      prisma,
      env: {},
      argv: ['--tenant-id', 'tenant_acme'],
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_acme' },
      data: { creditsBalance: DEFAULT_INITIAL_FREE_CREDITS },
    });
    expect(result.tenant.initial_credits_granted).toBe(true);
    expect(result.tenant.credits_balance).toBe(DEFAULT_INITIAL_FREE_CREDITS);
  });

  it('fails production bootstrap without a tenant email and rejects unusable credit floors', () => {
    expect(() => resolveBootstrapOptions({
      env: { NODE_ENV: 'production' },
    })).toThrow('BOOTSTRAP_TENANT_EMAIL');

    expect(() => resolveBootstrapOptions({
      env: {
        BOOTSTRAP_INITIAL_CREDITS: String(MIN_LITE_RESEARCH_CREDITS - 1),
      },
    })).toThrow(`at least ${MIN_LITE_RESEARCH_CREDITS}`);
  });
});
