import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireProductionConfig } from '../../src/config/production.js';

describe('production config validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubRequiredProductionEnv() {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://veritas:strong-db-password@db.example.test:5432/veritas');
    vi.stubEnv('REDIS_URL', 'redis://:strong-redis-password@redis.example.test:6379');
    vi.stubEnv('ADMIN_API_TOKEN', 'admin-token-with-entropy');
    vi.stubEnv('ALLOWED_ORIGINS', 'https://dashboard.example.test');
    vi.stubEnv('OPENAI_API_KEY', 'sk-realistic-test-key');
    vi.stubEnv('TAVILY_API_KEY', 'tvly-realistic-test-key');
  }

  it('rejects placeholder credentials embedded inside production URLs', () => {
    stubRequiredProductionEnv();
    vi.stubEnv('DATABASE_URL', 'postgresql://veritas:replace-with-db-password@db.example.test:5432/veritas');

    expect(() => requireProductionConfig()).toThrow(/DATABASE_URL password must not use an example value/);
  });

  it('rejects wildcard production CORS origins', () => {
    stubRequiredProductionEnv();
    vi.stubEnv('ALLOWED_ORIGINS', '*');

    expect(() => requireProductionConfig()).toThrow(/ALLOWED_ORIGINS must not include \*/);
  });
});
