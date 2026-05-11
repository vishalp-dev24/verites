/**
 * Blackboard - Collaborative Knowledge Store
 * 
 * Based on blackboard pattern where multiple workers
 * contribute facts that are consolidated and validated
 */

import { redis } from '../redis/client.js';
import { prisma } from '../database/client.js';

export interface Fact {
  id: string;
  claim: string;
  confidence: number;
  sources: string[];
  verified: boolean;
  timestamp: string;
  worker?: string;
  task?: string;
}

export interface Contradiction {
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  severity: 'high' | 'medium' | 'low';
  detected_at: string;
  status: 'open' | 'resolved' | 'dismissed';
}

export interface BlackboardEntry {
  id: string;
  value: string;
  sources: string[];
  confidence: number;
  verified: boolean;
  timestamp: string;
}

interface WorkerStatus {
  status: string;
  lastPing: string;
}

export class Blackboard {
  private jobId: string;
  private tenantId: string;
  private _facts: Fact[] = [];
  private _contradictions: Contradiction[] = [];
  private _workerStatus: Record<string, WorkerStatus> = {};

  constructor(jobId: string, tenantId: string) {
    this.jobId = jobId;
    this.tenantId = tenantId;
  }

  async initialize(): Promise<void> {
    const record = await prisma.researchJob.findUnique({
      where: { jobId: this.jobId },
    });

    if (record && record.data) {
      const data = record.data as Record<string, unknown>;
      if (data.facts && Array.isArray(data.facts)) {
        this._facts = data.facts as Fact[];
      }
      if (data.contradictions && Array.isArray(data.contradictions)) {
        this._contradictions = data.contradictions as Contradiction[];
      }
    }
  }

  async addEntry(entry: BlackboardEntry): Promise<void> {
    const fact: Fact = {
      id: entry.id,
      claim: entry.value,
      confidence: entry.confidence,
      sources: entry.sources,
      verified: entry.verified,
      timestamp: entry.timestamp,
    };
    this._facts.push(fact);
    await this.persist();
  }

  async addVerifiedFact(fact: Fact): Promise<void> {
    this._facts.push(fact);
    await this.persist();
  }

  async addContradiction(contradiction: Contradiction): Promise<void> {
    this._contradictions.push(contradiction);
    await this.persist();
  }

  async updateWorkerStatus(workerId: string, status: string): Promise<void> {
    this._workerStatus[workerId] = { status, lastPing: new Date().toISOString() };
  }

  getFacts(): Fact[] {
    return this._facts;
  }

  getContradictions(): Contradiction[] {
    return this._contradictions;
  }

  getWorkerStatus(): Record<string, WorkerStatus> {
    return this._workerStatus;
  }

  async persist(): Promise<void> {
    await prisma.researchJob.update({
      where: { jobId: this.jobId },
      data: {
        data: {
          facts: this._facts,
          contradictions: this._contradictions,
        } as object,
      },
    });
  }

  async getFinalOutput(): Promise<{
    facts: Fact[];
    contradictions: Contradiction[];
    summary: string;
  }> {
    return {
      facts: this._facts,
      contradictions: this._contradictions,
      summary: this.generateSummary(),
    };
  }

  private generateSummary(): string {
    const verifiedFacts = this._facts.filter(f => f.verified);
    return `Research completed with ${verifiedFacts.length} verified facts ` +
           `and ${this._contradictions.length} contradictions.`;
  }
}

// Singleton for non-job-specific operations
export const blackboard = {
  async get(jobId: string): Promise<Record<string, unknown> | null> {
    // Get from Redis
    const data = await redis.get(`blackboard${jobId}:data`);
    if (data) {
      return JSON.parse(data);
    }
    
    // Fallback to Prisma
    const record = await prisma.researchJob.findUnique({
      where: { jobId },
    });
    return record?.data as Record<string, unknown> || null;
  },

  async set(jobId: string, data: Record<string, unknown>): Promise<void> {
    await redis.setex(`blackboard${jobId}:data`, 3600, JSON.stringify(data));
    
    await prisma.researchJob.update({
      where: { jobId },
      data: { data: data as object },
    });
  },

  async update(jobId: string, updates: Record<string, unknown>): Promise<void> {
    const existing = await this.get(jobId) || {};
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.set(jobId, merged);
  },

  async appendFact(jobId: string, fact: unknown): Promise<void> {
    const factsKey = `blackboard${jobId}:facts`;
    await redis.lpush(factsKey, JSON.stringify(fact));
  },

  async getFacts(jobId: string): Promise<Fact[]> {
    const factsKey = `blackboard${jobId}:facts`;
    const facts = await redis.lrange(factsKey, 0, -1);
    return facts.map((f: string) => JSON.parse(f) as Fact);
  },

  async getJobState(jobId: string): Promise<{ verifiedFacts: Fact[] } | null> {
    const facts = await this.getFacts(jobId);
    return { verifiedFacts: facts };
  },

  async addVerifiedFact(
    jobId: string,
    _taskId: string,
    findings: string,
    sources: string[]
  ): Promise<void> {
    const fact: Fact = {
      id: `fact_${Date.now()}`,
      claim: findings,
      sources,
      confidence: 0.8,
      verified: true,
      timestamp: new Date().toISOString(),
    };
    await this.appendFact(jobId, fact);
  },

  async logContradiction(jobId: string, contradiction: Contradiction): Promise<void> {
    const key = `blackboard${jobId}:contradictions`;
    await redis.lpush(key, JSON.stringify(contradiction));
  },

  async getContradictions(jobId: string): Promise<Contradiction[]> {
    const key = `blackboard${jobId}:contradictions`;
    const contradictions = await redis.lrange(key, 0, -1);
    return contradictions.map((c: string) => JSON.parse(c) as Contradiction);
  },

  async logDomainAccess(jobId: string, domain: string): Promise<void> {
    await redis.hincrby(`blackboard${jobId}:domains`, domain, 1);
  },

  async getDomainAccess(jobId: string, domain: string): Promise<number> {
    const count = await redis.hget(`blackboard${jobId}:domains`, domain);
    return parseInt(count || '0', 10);
  },

  async cleanup(jobId: string): Promise<void> {
    const keys = await redis.keys(`blackboard${jobId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
