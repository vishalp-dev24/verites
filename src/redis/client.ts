/**
 * Redis Client
 * For Blackboard, job queues, and caching
 */

import { Redis } from 'ioredis';

const isDev = process.env.NODE_ENV === 'development';
const redisUrl = process.env.REDIS_URL || (isDev || process.env.NODE_ENV === 'test' ? 'redis://localhost:6379' : '');

if (!redisUrl) {
  throw new Error('REDIS_URL is required outside development/test');
}

export const redis = new Redis(redisUrl, {
  retryStrategy: (times: number) => {
    if (isDev && times > 1) {
      return null; // Stop retrying in dev after 1 attempt
    }
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: isDev ? 1 : 3,
  enableOfflineQueue: false,
});

redis.on('connect', () => {
  console.log('Redis connected');
});

redis.on('error', (err: Error) => {
  const isConnectionError = (err as any).code === 'ECONNREFUSED';
  if (!isConnectionError) {
    console.error('Redis error:', err);
  }
});

// Blackboard operations
export const blackboard = {
  async get(jobId: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`blackboard:${jobId}`);
    return data ? JSON.parse(data) : null;
  },

  async set(jobId: string, data: Record<string, unknown>, ttlSeconds = 3600): Promise<void> {
    await redis.setex(`blackboard:${jobId}`, ttlSeconds, JSON.stringify(data));
  },

  async update(jobId: string, updates: Record<string, unknown>): Promise<void> {
    const existing = await this.get(jobId);
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.set(jobId, merged);
  },

  async appendFact(jobId: string, fact: Record<string, unknown>): Promise<void> {
    await redis.lpush(`blackboard:${jobId}:facts`, JSON.stringify(fact));
  },

  async getFacts(jobId: string): Promise<Record<string, unknown>[]> {
    const facts = await redis.lrange(`blackboard:${jobId}:facts`, 0, -1);
    return (facts as string[]).map((f: string) => JSON.parse(f));
  },

  async getJobState(jobId: string): Promise<{ verifiedFacts: Record<string, unknown>[] } | null> {
    const facts = await this.getFacts(jobId);
    return { verifiedFacts: facts };
  },

  async addVerifiedFact(jobId: string, _taskId: string, findings: string, sources: string[]): Promise<void> {
    const fact = {
      id: `fact_${Date.now()}`,
      value: findings,
      sources,
      confidence: 0.8,
      verified: true,
      timestamp: new Date().toISOString(),
    };
    await this.appendFact(jobId, fact);
  },

  async logContradiction(
    jobId: string,
    contradiction: Record<string, unknown>
  ): Promise<void> {
    await redis.lpush(`blackboard:${jobId}:contradictions`, JSON.stringify(contradiction));
  },

  async getContradictions(jobId: string): Promise<Record<string, unknown>[]> {
    const contradictions = await redis.lrange(`blackboard:${jobId}:contradictions`, 0, -1);
    return (contradictions as string[]).map((c: string) => JSON.parse(c));
  },

  async logDomainAccess(jobId: string, domain: string): Promise<void> {
    await redis.hincrby(`blackboard:${jobId}:domains`, domain, 1);
  },

  async getDomainAccess(jobId: string, domain: string): Promise<number> {
    const count = await redis.hget(`blackboard:${jobId}:domains`, domain);
    return parseInt(count || '0', 10);
  },

  async cleanup(jobId: string): Promise<void> {
    const keys = await redis.keys(`blackboard:${jobId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

// Job queue operations
export const jobQueue = {
  async enqueue(queueName: string, job: Record<string, unknown>): Promise<void> {
    await redis.lpush(`queue:${queueName}`, JSON.stringify(job));
  },

  async dequeue(queueName: string): Promise<Record<string, unknown> | null> {
    const job = await redis.brpop(`queue:${queueName}`, 5);
    return job ? JSON.parse(job[1]) : null;
  },

  async getQueueLength(queueName: string): Promise<number> {
    return redis.llen(`queue:${queueName}`);
  },
};

// Session memory operations
export const sessionMemory = {
  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  },

  async set(
    sessionId: string,
    data: Record<string, unknown>,
    ttlDays = 30
  ): Promise<void> {
    await redis.setex(
      `session:${sessionId}`,
      ttlDays * 24 * 60 * 60,
      JSON.stringify(data)
    );
  },

  async appendTopic(sessionId: string, topic: string): Promise<void> {
    await redis.lpush(`session:${sessionId}:topics`, topic);
  },

  async appendConclusion(sessionId: string, conclusion: string): Promise<void> {
    await redis.lpush(`session:${sessionId}:conclusions`, conclusion);
  },

  async delete(sessionId: string): Promise<void> {
    const keys = await redis.keys(`session:${sessionId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

// Semantic caching
export const semanticCache = {
  async get(fingerprint: string): Promise<Record<string, unknown> | null> {
    const data = await redis.get(`cache:${fingerprint}`);
    return data ? JSON.parse(data) : null;
  },

  async set(
    fingerprint: string,
    data: Record<string, unknown>,
    ttlMinutes = 480
  ): Promise<void> {
    // Add artificial delay for timing attack prevention
    const artificialDelay = Math.random() * 320 + 80; // 80-400ms
    await new Promise(resolve => setTimeout(resolve, artificialDelay));

    await redis.setex(`cache:${fingerprint}`, ttlMinutes * 60, JSON.stringify(data));
  },

  async setEmbedding(fingerprint: string, embedding: number[]): Promise<void> {
    await redis.setex(
      `cache:embedding:${fingerprint}`,
      60 * 60 * 48, // 48 hours
      JSON.stringify(embedding)
    );
  },

  async getEmbedding(fingerprint: string): Promise<number[] | null> {
    const data = await redis.get(`cache:embedding:${fingerprint}`);
    return data ? JSON.parse(data) : null;
  },

  async delete(fingerprint: string): Promise<void> {
    await redis.del(`cache:${fingerprint}`);
    await redis.del(`cache:embedding:${fingerprint}`);
  },

  async keys(pattern: string): Promise<string[]> {
    return redis.keys(`cache:${pattern}`);
  },
};

// Rate limiting
export const rateLimiter = {
  async isAllowed(
    tenantId: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `rate:${tenantId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - count);
    return {
      allowed: count <= maxRequests,
      remaining,
    };
  },
};

// API key tracking
export const apiKeyTracking = {
  async trackUsage(keyId: string, mode: string, cost: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await redis.hincrby(`key:${keyId}:daily`, `${today}:${mode}`, 1);
    await redis.hincrby(`key:${keyId}:cost`, today, cost);
  },

  async getDailyStats(keyId: string): Promise<Record<string, number>> {
    const today = new Date().toISOString().split('T')[0];
    const stats = await redis.hgetall(`key:${keyId}:daily`);
    const result: Record<string, number> = {};

    for (const [key, value] of Object.entries(stats)) {
      if (key.startsWith(today)) {
        result[key] = parseInt(value as string, 10);
      }
    }

    return result;
  },
};
