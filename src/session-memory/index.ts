/**
 * Session Memory Store
 * Persistent store keyed by session ID
 * Stores: topics researched, key conclusions, follow-up queries
 * Sessions expire after inactivity period (configurable)
 */

import { sessionMemory } from '../redis/client.js';
import { SessionMemory } from '../types/index.js';
import { prisma } from '../database/client.js';

interface SessionConfig {
  ttlDays: number;
  maxTopics: number;
  maxConclusions: number;
}

const defaultConfig: SessionConfig = {
  ttlDays: 30,
  maxTopics: 100,
  maxConclusions: 50,
};

export class SessionMemoryService {
  private config: SessionConfig;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Get or create session
   */
  async getSession(sessionId: string, tenantId: string): Promise<SessionMemory> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);

    // Try Redis first
    let session = await sessionMemory.get(cacheKey);

    if (!session) {
      // Try database
      const dbSession = await prisma.session.findFirst({
        where: { sessionId, tenantId },
      });

      if (dbSession) {
        session = {
          session_id: dbSession.sessionId,
          topics_researched: dbSession.topicsResearched as string[],
          key_conclusions: dbSession.keyConclusions as string[],
          follow_up_queries: dbSession.followUpQueries as string[],
          timestamp: dbSession.updatedAt.toISOString(),
          ttl: this.config.ttlDays,
        };

        // Restore to Redis
        await this.saveToRedis(sessionId, tenantId, session);
      } else {
        // Create new session
        session = {
          session_id: sessionId,
          topics_researched: [],
          key_conclusions: [],
          follow_up_queries: [],
          timestamp: new Date().toISOString(),
          ttl: this.config.ttlDays,
        };

        await this.saveToDatabase(sessionId, tenantId, session);
        await this.saveToRedis(sessionId, tenantId, session);
      }
    }

    return session as unknown as SessionMemory;
  }

  /**
   * Add topic to session
   */
  async addTopic(sessionId: string, tenantId: string, topic: string): Promise<void> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);
    const session = await this.getSession(sessionId, tenantId) as unknown as Record<string, unknown>;
    const topics = session.topics_researched as string[] || [];

    if (!topics.includes(topic) && topics.length < this.config.maxTopics) {
      topics.push(topic);
      session.topics_researched = topics;
      session.timestamp = new Date().toISOString();
      await this.saveToRedis(sessionId, tenantId, session);
      await this.saveToDatabase(sessionId, tenantId, session);
      await sessionMemory.appendTopic(cacheKey, topic);
    }
  }

  /**
   * Add conclusion to session
   */
  async addConclusion(sessionId: string, tenantId: string, conclusion: string): Promise<void> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);
    const session = await this.getSession(sessionId, tenantId) as unknown as Record<string, unknown>;
    const conclusions = session.key_conclusions as string[] || [];

    if (conclusions.length < this.config.maxConclusions) {
      conclusions.push(conclusion);
      session.key_conclusions = conclusions;
      session.timestamp = new Date().toISOString();
      await this.saveToRedis(sessionId, tenantId, session);
      await this.saveToDatabase(sessionId, tenantId, session);
      await sessionMemory.appendConclusion(cacheKey, conclusion);
    }
  }

  /**
   * Add follow-up query to session
   */
  async addFollowUpQuery(sessionId: string, tenantId: string, query: string): Promise<void> {
    const session = await this.getSession(sessionId, tenantId) as unknown as Record<string, unknown>;
    const queries = session.follow_up_queries as string[] || [];

    if (!queries.includes(query)) {
      queries.push(query);
      session.follow_up_queries = queries;
      session.timestamp = new Date().toISOString();
      await this.saveToRedis(sessionId, tenantId, session);
      await this.saveToDatabase(sessionId, tenantId, session);
    }
  }

  /**
   * Get context for planning
   */
  async getPlanningContext(
    sessionId: string,
    tenantId: string
  ): Promise<{ topics: string[]; conclusions: string[]; recentQueries: string[] }> {
    const session = await this.getSession(sessionId, tenantId);

    return {
      topics: session.topics_researched,
      conclusions: session.key_conclusions.slice(-10), // Last 10
      recentQueries: session.follow_up_queries.slice(-5), // Last 5
    };
  }

  /**
   * Get similar past research
   */
  async getSimilarResearch(
    sessionId: string,
    query: string,
    tenantId: string
  ): Promise<string[]> {
    const session = await this.getSession(sessionId, tenantId);
    const topics = session.topics_researched || [];

    // Simple similarity check (would use embeddings in production)
    const queryWords = query.toLowerCase().split(/\s+/);
    return topics.filter(topic => {
      const topicWords = topic.toLowerCase().split(/\s+/);
      const overlap = queryWords.filter(w => topicWords.includes(w));
      return overlap.length / Math.max(queryWords.length, topicWords.length) > 0.5;
    });
  }

  /**
   * Clear session
   */
  async clearSession(sessionId: string, tenantId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { sessionId, tenantId } });
    await sessionMemory.delete(this.getCacheKey(sessionId, tenantId));
  }

  /**
   * Add research to session
   */
  async addToSession(
    sessionId: string,
    data: {
      query: string;
      mode: string;
      sources: number;
      confidence: number;
      summary: string;
    },
    tenantId: string
  ): Promise<void> {
    await this.addTopic(sessionId, tenantId, data.query);
    await this.addConclusion(sessionId, tenantId, data.summary);

    // Store summary in Prisma
    await prisma.session.updateMany({
      where: { sessionId, tenantId },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update in database
   */
  private async saveToDatabase(
    sessionId: string,
    tenantId: string,
    session: Record<string, unknown>
  ): Promise<void> {
    const existing = await prisma.session.findFirst({
      where: { sessionId, tenantId },
    });

    if (existing) {
      await prisma.session.update({
        where: { id: existing.id },
        data: {
          topicsResearched: session.topics_researched as string[],
          keyConclusions: session.key_conclusions as string[],
          followUpQueries: session.follow_up_queries as string[],
          updatedAt: new Date(),
        },
      });
      return;
    }

    await prisma.session.create({
      data: {
        sessionId,
        tenantId,
        topicsResearched: session.topics_researched as string[],
        keyConclusions: session.key_conclusions as string[],
        followUpQueries: session.follow_up_queries as string[],
        expiresAt: new Date(Date.now() + this.config.ttlDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async saveToRedis(
    sessionId: string,
    tenantId: string,
    session: Record<string, unknown>
  ): Promise<void> {
    await sessionMemory.set(this.getCacheKey(sessionId, tenantId), session, this.config.ttlDays);
  }

  private getCacheKey(sessionId: string, tenantId: string): string {
    return `${this.encodeKeyPart(tenantId)}:${this.encodeKeyPart(sessionId)}`;
  }

  private encodeKeyPart(value: string): string {
    return Buffer.from(value, 'utf8').toString('hex');
  }
}

export const sessionMemoryService = new SessionMemoryService();
