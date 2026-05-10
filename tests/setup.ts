/**
 * Vitest Test Setup
 */

import { beforeAll, afterAll } from 'vitest';

// Global test configuration
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'test-api-key';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/research_platform_test';
});

afterAll(() => {
  // Cleanup
});
