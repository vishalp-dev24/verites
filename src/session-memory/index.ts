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
    // Try Redis first
    let session = await sessionMemory.get(sessionId);

    if (!session) {
      // Try database
      const dbSession = await prisma.session.findUnique({
        where: { sessionId },
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
        await this.saveToRedis(sessionId, session);
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
        await this.saveToRedis(sessionId, session);
      }
    }

    return session as SessionMemory;
  }

  /**
   * Add topic to session
   */
  async addTopic(sessionId: string, topic: string): Promise<void> {
    const session = await sessionMemory.get(sessionId);
    if (session) {
      const topics = session.topics_researched as string[] || [];
      if (!topics.includes(topic) && topics.length < this.config.maxTopics) {
        topics.push(topic);
        session.topics_researched = topics;
        await this.saveToRedis(sessionId, session);
        await sessionMemory.appendTopic(sessionId, topic);
      }
    }
  }

  /**
   * Add conclusion to session
   */
  async addConclusion(sessionId: string, conclusion: string): Promise<void> {
    const session = await sessionMemory.get(sessionId);
    if (session) {
      const conclusions = session.key_conclusions as string[] || [];
      if (conclusions.length < this.config.maxConclusions) {
        conclusions.push(conclusion);
        session.key_conclusions = conclusions;
        await this.saveToRedis(sessionId, session);
        await sessionMemory.appendConclusion(sessionId, conclusion);
      }
    }
  }

  /**
   * Add follow-up query to session
   */
  async addFollowUpQuery(sessionId: string, query: string): Promise<void> {
    const session = await sessionMemory.get(sessionId);
    if (session) {
      const queries = session.follow_up_queries as string[] || [];
      if (!queries.includes(query)) {
        queries.push(query);
        session.follow_up_queries = queries;
        await this.saveToRedis(sessionId, session);
      }
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
  async clearSession(sessionId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { sessionId } });
    await sessionMemory.delete(sessionId);
  }

  /**
   * Update in database
   */
  private async saveToDatabase(
    sessionId: string,
    tenantId: string,
    session: Record<string, unknown>
  ): Promise<void> {
    await prisma.session.upsert({
      where: { sessionId },
      update: {
        topicsResearched: session.topics_researched,
        keyConclusions: session.key_conclusions,
        followUpQueries: session.follow_up_queries,
        updatedAt: new Date(),
      },
      create: {
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
    session: Record<string, unknown>
  ): Promise<void> {
    await sessionMemory.set(sessionId, session, this.config.ttlDays);
  }
}

export const sessionMemoryService = new SessionMemoryService();
