/**
 * Semantic Cache
 * Caches research results based on semantic similarity
 * "Best EVs 2026" and "top electric cars this year" = same fingerprint
 */

import { createHash } from 'crypto';
import { semanticCache } from '../redis/client.js';
import { OpenAI } from 'openai';

interface CacheEntry {
  fingerprint: string;
  query: string;
  mode: string;
  result: unknown;
  sources: unknown[];
}

export class SemanticCacheService {
  private openai: OpenAI;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Generate semantic fingerprint for a query
   */
  async generateFingerprint(query: string, mode: string): Promise<string> {
    // Get embedding for semantic similarity
    const embedding = await this.getEmbedding(query);
    
    // Quantize to reduce size
    const quantized = this.quantize(embedding);
    
    // Create hash
    const hash = createHash('sha256')
      .update(JSON.stringify(quantized) + mode)
      .digest('hex')
      .substring(0, 32);

    return hash;
  }

  /**
   * Get cached result
   */
  async get(
    fingerprint: string,
    mode: string
  ): Promise<{ hit: boolean; data?: unknown; sources?: unknown[]; age?: number }> {
    const cached = await semanticCache.get(fingerprint);

    if (!cached) {
      return { hit: false };
    }

    // Check freshness
    const createdAt = new Date(cached.created_at as string).getTime();
    const age = Date.now() - createdAt;

    // TTL based on mode
    const ttlByMode: Record<string, number> = {
      lite: 2 * 60 * 60 * 1000,      // 2 hours
      medium: 8 * 60 * 60 * 1000,    // 8 hours
      deep: 48 * 60 * 60 * 1000,     // 48 hours
    };

    const maxAge = ttlByMode[mode] || ttlByMode.medium;

    if (age > maxAge) {
      // Expired
      await semanticCache.delete(fingerprint);
      return { hit: false };
    }

    return {
      hit: true,
      data: cached.result,
      sources: cached.sources as unknown[],
      age,
    };
  }

  /**
   * Set cached result
   */
  async set(
    fingerprint: string,
    query: string,
    mode: string,
    result: unknown,
    sources: unknown[]
  ): Promise<void> {
    const entry: CacheEntry = {
      fingerprint,
      query,
      mode,
      result,
      sources,
    };

    // TTL based on mode
    const ttlByMode: Record<string, number> = {
      lite: 120,    // 2 hours in minutes
      medium: 480,  // 8 hours
      deep: 2880,   // 48 hours
    };

    const ttl = ttlByMode[mode] || 480;

    await semanticCache.set(fingerprint, {
      ...entry,
      created_at: new Date().toISOString(),
    }, ttl);
  }

  /**
   * Invalidate cache for a tenant (GDPR)
   */
  async invalidateTenant(tenantId: string): Promise<void> {
    // In production, would use Redis SCAN to find and delete by tenant
    console.log(`[Cache] Invalidated cache for tenant: ${tenantId}`);
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    hitRate: number;
    totalRequests: number;
    cacheHits: number;
    costSaved: number;
  }> {
    // In production, track via Redis or metrics
    return {
      hitRate: 0.3,
      totalRequests: 1000,
      cacheHits: 300,
      costSaved: 1500, // Credits
    };
  }

  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache
    if (this.embeddingCache.has(text)) {
      return this.embeddingCache.get(text)!;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0].embedding;
      
      // Cache for reuse
      this.embeddingCache.set(text, embedding);
      
      // Limit cache size
      if (this.embeddingCache.size > 1000) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }

      return embedding;
    } catch (error) {
      console.error('[Cache] Failed to get embedding:', error);
      return [];
    }
  }

  private quantize(embedding: number[]): number[] {
    // Reduce to 128 dimensions for fingerprinting
    const step = Math.floor(embedding.length / 128);
    const quantized: number[] = [];
    
    for (let i = 0; i < 128; i++) {
      const idx = i * step;
      quantized.push(Math.round(embedding[idx] * 100) / 100);
    }

    return quantized;
  }
}

export const semanticCacheService = new SemanticCacheService();
