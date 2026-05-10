/**
 * Blackboard
 * Shared worker intelligence store
 * 
 * Contents:
 * - Verified facts agreed across workers
 * - Contradictions detected between workers
 * - Domain access log (prevents thundering herd)
 * - Worker status per task
 * 
 * Orchestrator reads from Blackboard only - never raw worker output directly
 * This keeps orchestrator context flat regardless of worker count
 */

import { redis, blackboard } from '../redis/client.js';
import { Fact, Contradiction, DomainAccess, BlackboardEntry } from '../types/index.js';

export class BlackboardService {
  private jobId: string;
  private tenantId: string;

  constructor(jobId: string, tenantId: string) {
    this.jobId = jobId;
    this.tenantId = tenantId;
  }

  /**
   * Initialize blackboard for a new job
   */
  async initialize(): Promise<void> {
    const entry: BlackboardEntry = {
      job_id: this.jobId,
      task_id: 'master',
      verified_facts: [],
      contradictions: [],
      domain_access_log: [],
      worker_status: {},
      updated_at: new Date().toISOString(),
    };

    await blackboard.set(this.jobId, entry, 7200); // 2 hour TTL
  }

  /**
   * Add a verified fact from a worker
   */
  async addFact(fact: Fact): Promise<void> {
    const existingFacts = await blackboard.getFacts(this.jobId);
    
    // Check if similar fact already exists
    const similarFact = existingFacts.find(f => 
      this.levenshteinSimilarity(f.claim as string, fact.claim) > 0.8
    );

    if (similarFact) {
      // Merge sources
      await this.mergeFactSources(similarFact, fact);
    } else {
      await blackboard.appendFact(this.jobId, fact);
    }

    await this.updateTimestamp();
  }

  /**
   * Log a contradiction between sources
   */
  async logContradiction(contradiction: Contradiction): Promise<void> {
    await blackboard.logContradiction(this.jobId, contradiction);
    await this.updateTimestamp();
  }

  /**
   * Record domain access (for throttling)
   */
  async recordDomainAccess(domain: string): Promise<void> {
    await blackboard.logDomainAccess(this.jobId, domain);
  }

  /**
   * Check if domain is being heavily accessed
   */
  async isDomainThrottled(domain: string, maxWorkers = 2): Promise<boolean> {
    const count = await blackboard.getDomainAccess(this.jobId, domain);
    return count >= maxWorkers;
  }

  /**
   * Update worker status
   */
  async updateWorkerStatus(taskId: string, status: string): Promise<void> {
    const entry = await blackboard.get(this.jobId);
    if (entry) {
      entry.worker_status = {
        ...entry.worker_status,
        [taskId]: status,
      };
      entry.updated_at = new Date().toISOString();
      await blackboard.set(this.jobId, entry);
    }
  }

  /**
   * Get all verified facts
   */
  async getFacts(): Promise<Fact[]> {
    return blackboard.getFacts(this.jobId);
  }

  /**
   * Get all contradictions
   */
  async getContradictions(): Promise<Contradiction[]> {
    return blackboard.getContradictions(this.jobId);
  }

  /**
   * Get worker statuses
   */
  async getWorkerStatuses(): Promise<Record<string, string>> {
    const entry = await blackboard.get(this.jobId);
    return entry?.worker_status as Record<string, string> || {};
  }

  /**
   * Get domain access log
   */
  async getDomainAccessLog(): Promise<DomainAccess[]> {
    const entry = await blackboard.get(this.jobId);
    return entry?.domain_access_log as DomainAccess[] || [];
  }

  /**
   * Get full blackboard for orchestrator
   */
  async getFullBlackboard(): Promise<BlackboardEntry | null> {
    const facts = await this.getFacts();
    const contradictions = await this.getContradictions();
    const workerStatuses = await this.getWorkerStatuses();
    const domainAccess = await this.getDomainAccessLog();

    return {
      job_id: this.jobId,
      task_id: 'master',
      verified_facts: facts,
      contradictions,
      domain_access_log: domainAccess,
      worker_status: workerStatuses,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Compress blackboard for context window
   */
  async getCompressedSummary(): Promise<string> {
    const facts = await this.getFacts();
    const contradictions = await this.getContradictions();

    const factsSummary = facts
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 20) // Top 20 facts
      .map(f => `- ${f.claim} (sources: ${(f.sources || []).length}, confidence: ${f.confidence})`)
      .join('\n');

    const contradictionsSummary = contradictions
      .slice(0, 5) // Top 5 contradictions
      .map(c => `! ${c.claim_a} vs ${c.claim_b}`)
      .join('\n');

    return `FACTS:\n${factsSummary}\n\nCONTRADICTIONS:\n${contradictionsSummary}`;
  }

  /**
   * Cleanup after job completion
   */
  async cleanup(): Promise<void> {
    await blackboard.cleanup(this.jobId);
  }

  /**
   * Check if job has facts
   */
  async hasData(): Promise<boolean> {
    const facts = await this.getFacts();
    return facts.length > 0;
  }

  /**
   * Get fact count
   */
  async getFactCount(): Promise<number> {
    const facts = await this.getFacts();
    return facts.length;
  }

  /**
   * Get contradiction count
   */
  async getContradictionCount(): Promise<number> {
    const contradictions = await this.getContradictions();
    return contradictions.length;
  }

  private async updateTimestamp(): Promise<void> {
    const entry = await blackboard.get(this.jobId);
    if (entry) {
      entry.updated_at = new Date().toISOString();
      await blackboard.set(this.jobId, entry);
    }
  }

  private levenshteinSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLen = Math.max(str1.length, str2.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  private async mergeFactSources(existing: Record<string, unknown>, newFact: Fact): Promise<void> {
    const existingSources = (existing.sources as string[]) || [];
    const newSources = (newFact.sources || []).filter(s => !existingSources.includes(s));
    
    if (newSources.length > 0) {
      // Update confidence
      const totalSources = existingSources.length + newSources.length;
      const newConfidence = Math.min(1.0, (existing.confidence as number || 0) + 0.1 * newSources.length);
      
      existing.sources = [...existingSources, ...newSources];
      existing.confidence = newConfidence;
      existing.verified = true;
    }
  }
}

export function createBlackboard(jobId: string, tenantId: string): BlackboardService {
  return new BlackboardService(jobId, tenantId);
}
