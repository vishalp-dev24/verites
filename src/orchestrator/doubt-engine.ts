/**
 * Doubt Engine
 * Identifies gaps, contradictions, and quality issues in research findings
 * Generates specific follow-up tasks for the orchestrator to re-dispatch
 */

import { llmService } from '../llm/index.js';
import { logger } from '../utils/logger.js';

export interface Finding {
  taskId: string;
  topic: string;
  content: string;
  sources: Source[];
  confidence: number;
}

export interface Source {
  url: string;
  title: string;
  trustScore: number;
  publishDate?: string;
}

export interface Doubt {
  id: string;
  type: 'thin_coverage' | 'contradiction' | 'low_confidence' | 'missing_perspective' | 'outdated';
  severity: 'critical' | 'high' | 'medium' | 'low';
  topic: string;
  description: string;
  relatedTaskIds: string[];
  suggestedQuery: string;
  reason: string;
  confidence: number;
}

export interface DoubtAnalysis {
  doubts: Doubt[];
  overallConfidence: number;
  coverageScore: number;
  recommendation: 'proceed' | 're_research' | 'fail';
}

/**
 * Analyzes findings for gaps and quality issues
 */
export async function analyzeForDoubts(
  originalQuery: string,
  findings: Finding[],
  mode: string
): Promise<DoubtAnalysis> {
  logger.info(`Analyzing ${findings.length} findings for doubts`, { query: originalQuery });

  const doubts: Doubt[] = [];
  let overallConfidence = 0;
  let coverageScore = 0;

  // 1. Check for thin coverage (too few sources per claim)
  const thinCoverageDoubts = detectThinCoverage(findings, mode);
  doubts.push(...thinCoverageDoubts);

  // 2. Check for contradictions between findings
  const contradictionDoubts = await detectContradictions(findings);
  doubts.push(...contradictionDoubts);

  // 3. Check for low confidence findings
  const lowConfidenceDoubts = detectLowConfidence(findings);
  doubts.push(...lowConfidenceDoubts);

  // 4. Check for missing perspectives
  const missingPerspectiveDoubts = await detectMissingPerspectives(originalQuery, findings);
  doubts.push(...missingPerspectiveDoubts);

  // 5. Check for outdated information
  const outdatedDoubts = detectOutdated(findings, mode);
  doubts.push(...outdatedDoubts);

  // Calculate overall metrics
  overallConfidence = calculateOverallConfidence(findings, doubts);
  coverageScore = calculateCoverageScore(originalQuery, findings);

  // Determine recommendation
  const criticalDoubts = doubts.filter(d => d.severity === 'critical').length;
  const highDoubts = doubts.filter(d => d.severity === 'high').length;

  let recommendation: DoubtAnalysis['recommendation'] = 'proceed';
  if (criticalDoubts > 2 || (criticalDoubts > 0 && highDoubts > 2)) {
    recommendation = 're_research';
  } else if (criticalDoubts > 0 || highDoubts > 3) {
    recommendation = 're_research';
  } else if (highDoubts > 0 && mode === 'deep') {
    recommendation = 're_research';
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  doubts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    doubts: doubts.slice(0, 5), // Max 5 doubts at a time
    overallConfidence,
    coverageScore,
    recommendation,
  };
}

/**
 * Detect claims with insufficient source coverage
 */
function detectThinCoverage(findings: Finding[], mode: string): Doubt[] {
  const doubts: Doubt[] = [];
  
  const minSources = mode === 'deep' ? 4 : mode === 'medium' ? 2 : 1;

  for (const finding of findings) {
    if (finding.sources.length < minSources) {
      doubts.push({
        id: `doubt_thin_${Date.now()}_${finding.taskId}`,
        type: 'thin_coverage',
        severity: finding.sources.length === 0 ? 'critical' : 'high',
        topic: finding.topic,
        description: `Finding has only ${finding.sources.length} source(s), need ${minSources}+ for ${mode} mode`,
        relatedTaskIds: [finding.taskId],
        suggestedQuery: `More sources about: ${finding.topic}`,
        reason: 'insufficient_source_coverage',
        confidence: 0.9,
      });
    }
  }

  return doubts;
}

/**
 * Detect contradictions between findings using LLM
 */
async function detectContradictions(findings: Finding[]): Promise<Doubt[]> {
  if (findings.length < 2) return [];

  const doubts: Doubt[] = [];

  // Compare pairs of findings
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const f1 = findings[i];
      const f2 = findings[j];

      const contradiction = await checkContradiction(f1, f2);
      
      if (contradiction.exists) {
        doubts.push({
          id: `doubt_contradiction_${Date.now()}_${i}_${j}`,
          type: 'contradiction',
          severity: contradiction.severity as any,
          topic: `Contradiction: ${f1.topic} vs ${f2.topic}`,
          description: contradiction.description,
          relatedTaskIds: [f1.taskId, f2.taskId],
          suggestedQuery: `Reconcile: ${f1.topic} OR ${f2.topic}`,
          reason: 'conflicting_information_detected',
          confidence: contradiction.confidence,
        });
      }
    }
  }

  return doubts;
}

async function checkContradiction(f1: Finding, f2: Finding): Promise<{ 
  exists: boolean; 
  severity: string; 
  description: string;
  confidence: number;
}> {
  const prompt = `Compare these two research findings and determine if they contradict each other:

TOPIC A: "${f1.topic}"
CONTENT A: "${f1.content.slice(0, 500)}"

TOPIC B: "${f2.topic}"
CONTENT B: "${f2.content.slice(0, 500)}"

Do these findings contradict each other (say opposite things about the same fact)?
Return JSON: {"contradiction": true/false, "severity": "critical/high/medium/none", "description": "explanation", "confidence": 0.0-1.0}`;

  try {
    const response = await llmService.generate([
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    const result = JSON.parse(response);
    return {
      exists: result.contradiction === true,
      severity: result.severity || 'none',
      description: result.description || '',
      confidence: result.confidence || 0.5,
    };
  } catch (err) {
    // Fallback: simple string similarity check
    const similarity = calculateSimilarity(f1.content, f2.content);
    if (similarity < 0.3) {
      return { exists: false, severity: 'none', description: '', confidence: 0.5 };
    }
    return { exists: false, severity: 'none', description: '', confidence: 0.5 };
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  return intersection.size / Math.max(words1.size, words2.size);
}

/**
 * Detect findings with low confidence scores
 */
function detectLowConfidence(findings: Finding[]): Doubt[] {
  return findings
    .filter(f => f.confidence < 0.6)
    .map(f => ({
      id: `doubt_lowconf_${Date.now()}_${f.taskId}`,
      type: 'low_confidence' as const,
      severity: f.confidence < 0.4 ? 'high' : 'medium' as const,
      topic: f.topic,
      description: `Low confidence (${(f.confidence * 100).toFixed(0)}%) in finding`,
      relatedTaskIds: [f.taskId],
      suggestedQuery: `Verify: ${f.topic}`,
      reason: 'low_confidence_score',
      confidence: 1 - f.confidence,
    }));
}

/**
 * Detect missing perspectives on the topic
 */
async function detectMissingPerspectives(query: string, findings: Finding[]): Promise<Doubt[]> {
  if (findings.length === 0) return [];

  const prompt = `Given this research query and findings, identify important perspectives or angles that are NOT covered:

QUERY: "${query}"

TOPICS COVERED:
${findings.map(f => `- ${f.topic}`).join('\n')}

What important perspectives, viewpoints, or aspects are missing from this research?
Return JSON array: [{"perspective": "name", "importance": "critical/high/medium", "suggested_query": "search query to fill gap"}]
Return empty array [] if coverage seems complete.`;

  try {
    const response = await llmService.generate([
      { role: 'user', content: prompt }
    ], { temperature: 0.3 });

    const gaps = JSON.parse(response);
    if (!Array.isArray(gaps)) return [];

    return gaps.map((gap: any, idx: number) => ({
      id: `doubt_missing_${Date.now()}_${idx}`,
      type: 'missing_perspective' as const,
      severity: (gap.importance || 'medium').toLowerCase() as any,
      topic: gap.perspective,
      description: `Missing perspective: ${gap.perspective}`,
      relatedTaskIds: [],
      suggestedQuery: gap.suggested_query || `Research: ${gap.perspective}`,
      reason: 'coverage_gap',
      confidence: 0.7,
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Detect potentially outdated information
 */
function detectOutdated(findings: Finding[], mode: string): Doubt[] {
  if (mode === 'lite') return [];

  const maxAgeDays = mode === 'deep' ? 365 : 180; // 1 year for deep, 6 months for medium
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  return findings
    .filter(f => {
      const hasOldSources = f.sources.some(s => {
        if (!s.publishDate) return false;
        const date = new Date(s.publishDate);
        return date < cutoff;
      });
      return hasOldSources && f.sources.every(s => !s.publishDate || new Date(s.publishDate) < cutoff);
    })
    .map(f => ({
      id: `doubt_outdated_${Date.now()}_${f.taskId}`,
      type: 'outdated' as const,
      severity: 'medium' as const,
      topic: f.topic,
      description: `Information may be outdated (sources older than ${maxAgeDays} days)`,
      relatedTaskIds: [f.taskId],
      suggestedQuery: `Latest ${new Date().getFullYear()}: ${f.topic}`,
      reason: 'potentially_outdated',
      confidence: 0.6,
    }));
}

function calculateOverallConfidence(findings: Finding[], doubts: Doubt[]): number {
  if (findings.length === 0) return 0;

  const avgFindingConfidence = findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;
  
  // Reduce confidence based on doubts
  const criticalPenalty = doubts.filter(d => d.severity === 'critical').length * 0.2;
  const highPenalty = doubts.filter(d => d.severity === 'high').length * 0.1;
  const mediumPenalty = doubts.filter(d => d.severity === 'medium').length * 0.05;

  return Math.max(0, avgFindingConfidence - criticalPenalty - highPenalty - mediumPenalty);
}

function calculateCoverageScore(query: string, findings: Finding[]): number {
  if (findings.length === 0) return 0;
  
  // Simple heuristic: more findings = better coverage, but diminishing returns
  const idealCount = 5;
  const ratio = Math.min(findings.length / idealCount, 1);
  return ratio * 0.7 + 0.3; // Base 30% for having any findings
}
