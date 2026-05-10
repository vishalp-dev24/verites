
/**
 * Security Service
 * Content validation and threat detection
 */

import axios from 'axios';

interface SecurityCheck {
  safe: boolean;
  reason?: string;
  riskScore: number;
}

export class SecurityService {
  // Layer 1: Content extraction (already done in worker)
  
  // Layer 2: Intent Classifier
  async checkContent(content: string): Promise<SecurityCheck> {
    const riskScore = this.calculateRiskScore(content);
    
    if (riskScore > 0.7) {
      return {
        safe: false,
        reason: 'Content flagged as high-risk',
        riskScore,
      };
    }

    // Check for injection patterns
    const injectionPatterns = [
      /ignore previous/i,
      /ignore all prior/i,
      /system prompt/i,
      /you are now/i,
      / became /i,
      /disregard .{0,20} instruction/i,
      /\[system\]/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(content)) {
        return {
          safe: false,
          reason: 'Potential prompt injection detected',
          riskScore: 0.8,
        };
      }
    }

    return { safe: true, riskScore };
  }

  private calculateRiskScore(content: string): number {
    let score = 0;
    const lowerContent = content.toLowerCase();
    
    // Check for instruction-like language
    const suspiciousPatterns = [
      { pattern: /(you must|please|as an?|ignore|forget|reset)/g, weight: 0.2 },
      { pattern: /(new instructions|prompt injection|jailbreak)/g, weight: 0.5 },
      { pattern: /\[.+\]|%7B.+\}|\x.+\x/g, weight: 0.4 },
    ];

    for (const { pattern, weight } of suspiciousPatterns) {
      const matches = (lowerContent.match(pattern) || []).length;
      score += matches * weight;
    }

    return Math.min(1, score);
  }

  // Layer 3: Orchestrator read-only (enforced by architecture - orchestrator can't execute)

  // Layer 4: Output validation
  validateOutput(data: any): SecurityCheck {
    const jsonString = JSON.stringify(data);
    
    // Check for injected instructions in output
    const suspiciousPatterns = [
      /ignore previous/i,
      /system prompt/i,
      /you are now/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(jsonString)) {
        return {
          safe: false,
          reason: 'Suspicious content in output',
          riskScore: 0.6,
        };
      }
    }

    return { safe: true, riskScore: 0 };
  }
}

export const securityService = new SecurityService();
