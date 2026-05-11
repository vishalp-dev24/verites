/**
 * Trust Scorer
 * Evaluates every source on credibility factors
 * 
 * Factors:
 * - Domain authority
 * - Content freshness (days since publish)
 * - Source type (primary vs secondary)
 * - Citation depth
 * - Cross-source consistency
 * 
 * Output: trust score 0.0-1.0 per source
 */

import { TrustScoreInput, TrustScoreOutput } from '../types/index.js';

interface DomainAuthority {
  domain: string;
  authority: number;
}

// Domain authority database (would be populated from external source)
const domainAuthorityDB: Map<string, number> = new Map([
  ['.gov', 0.95],
  ['.edu', 0.92],
  ['wikipedia.org', 0.88],
  ['arxiv.org', 0.90],
  ['doi.org', 0.92],
  ['.org', 0.75],
  ['github.com', 0.80],
  ['medium.com', 0.60],
  ['blogspot.com', 0.45],
  ['wordpress.com', 0.45],
]);

export class TrustScorer {
  /**
   * Calculate trust score for a source
   */
  calculate(input: TrustScoreInput): TrustScoreOutput {
    const domainAuthority = this.scoreDomainAuthority(input.domain);
    const freshness = this.scoreFreshness(input.content_freshness_days);
    const sourceType = input.source_type === 'primary' ? 0.9 : 0.6;
    const citationQuality = this.normalizeCitationDepth(input.citation_depth);
    const consistency = input.cross_source_consistency;

    // Weighted average
    const score = 
      domainAuthority * 0.25 +
      freshness * 0.20 +
      sourceType * 0.25 +
      citationQuality * 0.15 +
      consistency * 0.15;

    return {
      score: Math.min(Math.max(score, 0.0), 1.0),
      factors: {
        domain_authority: domainAuthority,
        freshness,
        source_type_weight: sourceType,
        citation_quality: citationQuality,
        consistency,
      },
    };
  }

  /**
   * Score domain authority
   */
  private scoreDomainAuthority(domain: string): number {
    // Check for exact match
    const exactMatch = domainAuthorityDB.get(domain);
    if (exactMatch) return exactMatch;

    // Check for TLD match
    for (const [suffix, authority] of Array.from(domainAuthorityDB.entries())) {
      if (suffix.startsWith('.') && domain.endsWith(suffix)) {
        return authority;
      }
      if (domain.includes(suffix)) {
        return authority;
      }
    }

    // Default score for unknown domains
    return 0.5;
  }

  /**
   * Score content freshness
   */
  private scoreFreshness(daysOld: number): number {
    if (daysOld < 7) return 1.0;      // Less than a week
    if (daysOld < 30) return 0.9;     // Less than a month
    if (daysOld < 90) return 0.8;     // Less than 3 months
    if (daysOld < 365) return 0.6;    // Less than a year
    if (daysOld < 730) return 0.4;    // Less than 2 years
    return 0.2;                        // Older
  }

  /**
   * Normalize citation depth (0-10+ citations)
   */
  private normalizeCitationDepth(citationCount: number): number {
    return Math.min(citationCount / 10, 1.0);
  }

  /**
   * Check if source passes threshold
   */
  passesThreshold(
    input: TrustScoreInput,
    mode: 'lite' | 'medium' | 'deep'
  ): boolean {
    const score = this.calculate(input);
    
    const thresholds = {
      lite: 0.3,
      medium: 0.5,
      deep: 0.7,
    };

    return score.score >= thresholds[mode];
  }

  /**
   * Get source tier
   */
  getTier(score: number): 'tier1' | 'tier2' | 'tier3' {
    if (score >= 0.8) return 'tier1';
    if (score >= 0.5) return 'tier2';
    return 'tier3';
  }

  /**
   * Bulk score sources
   */
  bulkScore(inputs: TrustScoreInput[]): TrustScoreOutput[] {
    return inputs.map(input => this.calculate(input));
  }
}

export const trustScorer = new TrustScorer();
