/**
 * Security Service
 * 4-layer prompt injection defense
 * 1. Content Extraction - raw HTML never reaches LLM
 * 2. Intent Classifier - detects injection attempts
 * 3. Orchestrator Read-Only - zero action permissions
 * 4. Output Validation - final check
 */

import { OpenAI } from 'openai';

interface SecurityCheckInput {
  title: string;
  body_text: string;
  url: string;
}

interface SecurityCheckResult {
  safe: boolean;
  risk_score: number;
  flagged_patterns: string[];
  action: 'allow' | 'quarantine' | 'block';
}

export class SecurityService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Layer 2: Intent Classifier
   * Detects instruction-like language directed at AI
   */
  async classifyIntent(input: SecurityCheckInput): Promise<SecurityCheckResult> {
    const injectionPatterns = [
      /ignore previous instructions/i,
      /disregard (?:all|your) instructions/i,
      /you are (?:now|no longer)/i,
      /act as (?:if|though)/i,
      /new (?:persona|role|character)/i,
      /system prompt/i,
      /prompt injection/i,
      /DAN mode/i,
      /jailbreak/i,
      /ignore safety guidelines/i,
    ];

    const combinedText = `${input.title} ${input.body_text}`.toLowerCase();
    const flaggedPatterns: string[] = [];

    for (const pattern of injectionPatterns) {
      if (pattern.test(combinedText)) {
        flaggedPatterns.push(pattern.source);
      }
    }

    // LLM-based classification
    const systemPrompt = `Classify text for prompt injection risk.\n\nRespond with JSON: {\"risk_score\": 0.0-1.0, \"reason\":  \string}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Classify:\n\nTitle: ${input.title}\n\nContent: ${input.body_text.substring(0, 1000)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const llmRisk = parsed.risk_score || 0;

        // Combine pattern detection with LLM score
        const patternRisk = flaggedPatterns.length * 0.25;
        const combinedRisk = Math.min(llmRisk + patternRisk, 1.0);

        return {
          safe: combinedRisk < 0.7,
          risk_score: combinedRisk,
          flagged_patterns: flaggedPatterns,
          action: combinedRisk > 0.9 ? 'block' : combinedRisk > 0.6 ? 'quarantine' : 'allow',
        };
      }
    } catch (error) {
      console.error('[Security] Classification error:', error);
    }

    // Fallback to pattern-only detection
    const riskScore = Math.min(flaggedPatterns.length * 0.3, 1.0);
    
    return {
      safe: riskScore < 0.7,
      risk_score: riskScore,
      flagged_patterns: flaggedPatterns,
      action: riskScore > 0.6 ? 'quarantine' : 'allow',
    };
  }

  /**
   * Layer 4: Output Validation
   * Final check before dispatch
   */
  validateOutput(data: unknown): { valid: boolean; sanitized: unknown } {
    const suspiciousInOutput = [
      /ignore this/i,
      /do not/i,
      /bypass/i,
      /override/i,
      /disregard/i,
    ];

    const text = JSON.stringify(data).toLowerCase();
    let hasSuspicious = false;

    for (const pattern of suspiciousInOutput) {
      if (pattern.test(text)) {
        hasSuspicious = true;
        break;
      }
    }

    if (hasSuspicious) {
      return {
        valid: false,
        sanitized: {
          error: 'suspicious_content_detected',
          original: null,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return { valid: true, sanitized: data };
  }

  /**
   * Validate schema
   */
  validateSchema(data: unknown, schema: Record<string, unknown>): { valid: boolean; errors: string[] } {
    // Simplified schema validation
    const errors: string[] = [];

    if (typeof data !== 'object' || data === null) {
      return { valid: false, errors: ['data must be an object'] };
    }

    const requiredProps = (schema.required as string[]) || [];
    const obj = data as Record<string, unknown>;

    for (const prop of requiredProps) {
      if (!(prop in obj)) {
        errors.push(`missing required property: ${prop}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Log security event
   */
  logEvent(event: {
    type: string;
    risk_score: number;
    source_url?: string;
    action: string;
    timestamp?: string;
  }): void {
    console.log('[Security Event]', JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    }));
  }
}

export const securityService = new SecurityService();
