/**
 * Trust Scorer Unit Tests
 * Tests for source credibility evaluation
 */

import { describe, it, expect } from 'vitest';
import { TrustScorer } from '../../src/trust-scorer/index.js';

describe('TrustScorer', () => {
  const scorer = new TrustScorer();

  describe('Domain Authority Scoring', () => {
    it('should assign high score to .gov domains', () => {
      const result = scorer.calculate({
        domain: 'cdc.gov',
        content_freshness_days: 30,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.9,
      });

      expect(result.factors.domain_authority).toBe(0.95);
    });

    it('should assign high score to .edu domains', () => {
      const result = scorer.calculate({
        domain: 'harvard.edu',
        content_freshness_days: 45,
        source_type: 'primary',
        citation_depth: 8,
        cross_source_consistency: 0.8,
      });

      expect(result.factors.domain_authority).toBe(0.92);
    });

    it('should assign higher score to arxiv.org', () => {
      const result = scorer.calculate({
        domain: 'arxiv.org',
        content_freshness_days: 10,
        source_type: 'primary',
        citation_depth: 10,
        cross_source_consistency: 0.85,
      });

      expect(result.factors.domain_authority).toBe(0.90);
    });

    it('should assign default score to unknown domains', () => {
      const result = scorer.calculate({
        domain: 'unknown-unknown-xyz.com',
        content_freshness_days: 100,
        source_type: 'secondary',
        citation_depth: 0,
        cross_source_consistency: 0.5,
      });

      expect(result.factors.domain_authority).toBe(0.5);
    });

    it('should assign lower score to blog platforms', () => {
      const result = scorer.calculate({
        domain: 'someblog.blogspot.com',
        content_freshness_days: 5,
        source_type: 'secondary',
        citation_depth: 2,
        cross_source_consistency: 0.4,
      });

      expect(result.factors.domain_authority).toBe(0.45);
    });
  });

  describe('Freshness Scoring', () => {
    it('should give full score to content less than 7 days old', () => {
      const result = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 3,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      expect(result.factors.freshness).toBe(1.0);
    });

    it('should reduce score for older content', () => {
      const veryOld = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 1000,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      const recent = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 5,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      expect(veryOld.factors.freshness).toBe(0.2);
      expect(recent.factors.freshness).toBe(1.0);
      expect(veryOld.score).toBeLessThan(recent.score);
    });
  });

  describe('Source Type Scoring', () => {
    it('should assign higher weight to primary sources', () => {
      const primary = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 30,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      const secondary = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 30,
        source_type: 'secondary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      expect(primary.factors.source_type_weight).toBe(0.9);
      expect(secondary.factors.source_type_weight).toBe(0.6);
      expect(primary.score).toBeGreaterThan(secondary.score);
    });
  });

  describe('Citation Quality Scoring', () => {
    it('should normalize citation depth correctly', () => {
      const lowCitation = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 30,
        source_type: 'primary',
        citation_depth: 2,
        cross_source_consistency: 0.8,
      });

      const highCitation = scorer.calculate({
        domain: 'example.com',
        content_freshness_days: 30,
        source_type: 'primary',
        citation_depth: 15,
        cross_source_consistency: 0.8,
      });

      expect(lowCitation.factors.citation_quality).toBe(0.2);
      expect(highCitation.factors.citation_quality).toBe(1.0);
    });
  });

  describe('Overall Score Calculation', () => {
    it('should return score between 0 and 1', () => {
      const result = scorer.calculate({
        domain: 'mix-example.com',
        content_freshness_days: 30,
        source_type: 'primary',
        citation_depth: 5,
        cross_source_consistency: 0.8,
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should calculate weighted average correctly', () => {
      const result = scorer.calculate({
        domain: 'example.gov',  // domain_authority: 0.95
        content_freshness_days: 60,  // freshness: 0.8
        source_type: 'primary',  // source_type_weight: 0.9
        citation_depth: 5,  // citation_quality: 0.5
        cross_source_consistency: 0.9,  // consistency: 0.9
      });

      // Expected: 0.95*0.25 + 0.8*0.20 + 0.9*0.25 + 0.5*0.15 + 0.9*0.15
      // = 0.2375 + 0.16 + 0.225 + 0.075 + 0.135 = 0.8325
      expect(result.score).toBeCloseTo(0.8325, 2);
    });
  });

  describe('Threshold Checking', () => {
    it('should pass lite mode with low score', () => {
      expect(scorer.passesThreshold({
        domain: 'low-quality.com',
        content_freshness_days: 365,
        source_type: 'secondary',
        citation_depth: 0,
        cross_source_consistency: 0.3,
      }, 'lite')).toBe(true);
    });

    it('should pass medium mode with decent score', () => {
      expect(scorer.passesThreshold({
        domain: 'medium.com',
        content_freshness_days: 30,
        source_type: 'secondary',
        citation_depth: 3,
        cross_source_consistency: 0.6,
      }, 'medium')).toBe(true);
    });

    it('should require high score for deep mode', () => {
      const lowQuality = scorer.calculate({
        domain: 'weak-source.com',
        content_freshness_days: 365,
        source_type: 'secondary',
        citation_depth: 1,
        cross_source_consistency: 0.4,
      });

      expect(scorer.passesThreshold({
        domain: 'weak-source.com',
        content_freshness_days: 365,
        source_type: 'secondary',
        citation_depth: 1,
        cross_source_consistency: 0.4,
      }, 'deep')).toBe(false);
    });
  });

  describe('Tier Assignment', () => {
    it('should assign tier1 to high scores', () => {
      expect(scorer.getTier(0.85)).toBe('tier1');
      expect(scorer.getTier(0.95)).toBe('tier1');
    });

    it('should assign tier2 to medium scores', () => {
      expect(scorer.getTier(0.65)).toBe('tier2');
      expect(scorer.getTier(0.79)).toBe('tier2');
    });

    it('should assign tier3 to low scores', () => {
      expect(scorer.getTier(0.3)).toBe('tier3');
      expect(scorer.getTier(0.49)).toBe('tier3');
    });
  });

  describe('Bulk Scoring', () => {
    it('should score multiple sources', () => {
      const inputs = [
        {
          domain: 'gov.example.gov',
          content_freshness_days: 10,
          source_type: 'primary' as const,
          citation_depth: 8,
          cross_source_consistency: 0.9,
        },
        {
          domain: 'old-blog.blogspot.com',
          content_freshness_days: 500,
          source_type: 'secondary' as const,
          citation_depth: 0,
          cross_source_consistency: 0.3,
        },
      ];

      const results = scorer.bulkScore(inputs);

      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });
});
