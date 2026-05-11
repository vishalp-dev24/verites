/**
 * Contradiction Engine
 * Cross-comparison of claims from different sources
 * 
 * Outputs:
 * - Claims agreed by majority
 * - Claims contradicted (with source attribution)
 * - Claims appearing in only one source (unverified)
 */

import { OpenAI } from 'openai';
import { Contradiction, Source } from '../types/index.js';

interface Claim {
  text: string;
  source: string;
  confidence: number;
}

export class ContradictionEngine {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Detect contradictions across sources
   */
  async detectContradictions(
    sources: Source[],
    mode: 'lite' | 'medium' | 'deep'
  ): Promise<Contradiction[]> {
    // Skip in lite mode
    if (mode === 'lite') return [];

    // Extract claims from sources
    const claims = await this.extractClaims(sources);

    // Group by similarity
    const claimGroups = this.groupClaims(claims);

    // Find contradictions
    const contradictions: Contradiction[] = [];

    for (const group of claimGroups) {
      if (group.length < 2) continue;

      // Check for contradictions within group
      const groupContradictions = await this.findContradictionsInGroup(group);
      contradictions.push(...groupContradictions);
    }

    return contradictions;
  }

  /**
   * Extract claims from source content using LLM
   */
  private async extractClaims(sources: Source[]): Promise<Claim[]> {
    const claims: Claim[] = [];

    const systemPrompt = `Extract factual claims from the provided text. Return claims as a JSON array of strings. Each claim should be a standalone factual statement.`;

    for (const source of sources) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extract claims from:

${source.content_excerpt}` },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) continue;

        const parsed = JSON.parse(content);
        const sourceClaims = parsed.claims || [];

        for (const claim of sourceClaims) {
          claims.push({
            text: claim,
            source: source.url,
            confidence: source.trust_score,
          });
        }
      } catch (error) {
        console.error('[ContradictionEngine] Failed to extract claims:', error);
      }
    }

    return claims;
  }

  /**
   * Group similar claims using semantic similarity
   */
  private groupClaims(claims: Claim[]): Claim[][] {
    const groups: Claim[][] = [];
    const threshold = 0.8;

    for (const claim of claims) {
      let added = false;

      for (const group of groups) {
        const similarity = this.calculateSimilarity(claim.text, group[0].text);
        if (similarity >= threshold) {
          group.push(claim);
          added = true;
          break;
        }
      }

      if (!added) {
        groups.push([claim]);
      }
    }

    return groups;
  }

  /**
   * Find contradictions within a group
   */
  private async findContradictionsInGroup(group: Claim[]): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    // Compare each pair in the group
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const claimA = group[i];
        const claimB = group[j];

        const isContradiction = await this.checkContradiction(
          claimA.text,
          claimB.text
        );

        if (isContradiction) {
          contradictions.push({
            claim_a: claimA.text,
            claim_b: claimB.text,
            source_a: claimA.source,
            source_b: claimB.source,
            severity: this.calculateSeverity(claimA, claimB),
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * Check if two claims contradict
   */
  private async checkContradiction(claim1: string, claim2: string): Promise<boolean> {
    const systemPrompt = `Determine if two claims contradict each other. Respond with JSON: { "contradiction": true/false, "confidence": 0.0-1.0 }`;

    const userPrompt = `Claim 1: ${claim1}\n\nClaim 2: ${claim2}\n\nDo these contradict?`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return false;

      const parsed = JSON.parse(content);
      return parsed.contradiction && parsed.confidence > 0.7;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate severity of contradiction
   */
  private calculateSeverity(claimA: Claim, claimB: Claim): 'low' | 'medium' | 'high' {
    const avgTrust = (claimA.confidence + claimB.confidence) / 2;
    
    if (avgTrust >= 0.8) return 'high';
    if (avgTrust >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Calculate text similarity using Jaccard index
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get claims with consensus
   */
  getConsensusClaims(groups: Claim[][]): Claim[] {
    return groups
      .filter(g => g.length >= 2)
      .map(g => g[0]);
  }

  /**
   * Get unverified claims (single source)
   */
  getUnverifiedClaims(groups: Claim[][]): Claim[] {
    return groups
      .filter(g => g.length === 1)
      .map(g => g[0]);
  }
}

export const contradictionEngine = new ContradictionEngine();
