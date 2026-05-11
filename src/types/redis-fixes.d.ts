// Type definitions to fix the type mismatches

declare module '../redis/client.js' {
  interface BlackboardMethods {
    set(jobId: string, entry: Record<string, unknown>, ttl?: number): Promise<void>;
    get(jobId: string): Promise<Record<string, unknown> | null>;
    appendFact(jobId: string, fact: Fact): Promise<void>;
    getFacts(jobId: string): Promise<Fact[]>;
    logContradiction(jobId: string, contradiction: Contradiction): Promise<void>;
    getContradictions(jobId: string): Promise<Contradiction[]>;
    logDomainAccess(jobId: string, domain: string): Promise<void>;
    getDomainAccess(jobId: string, domain: string): Promise<number>;
  }
}
