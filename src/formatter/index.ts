/**
 * Formatter
 * Maps synthesized research into requested output schema
 * Validates final output matches schema
 * Handles schema mismatches gracefully
 */

import { z } from 'zod';
import { OpenAI } from 'openai';

export class Formatter {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Format output according to schema
   */
  async format(
    data: unknown,
    schema: Record<string, unknown>
  ): Promise<unknown> {
    const systemPrompt = `Format the provided data to match the requested JSON schema exactly.\n\nSchema: ${JSON.stringify(schema)}\n\nRespond only with valid JSON matching the schema.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Data to format:\n${JSON.stringify(data)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.createNullResponse('empty_response');
      }

      const parsed = JSON.parse(content);
      
      // Validate against schema
      const validation = this.validateAgainstSchema(parsed, schema);
      if (!validation.valid) {
        console.warn('[Formatter] Schema validation failed:', validation.errors);
        return this.createNullResponse('schema_mismatch', validation.errors);
      }

      return parsed;
    } catch (error) {
      console.error('[Formatter] Formatting error:', error);
      return this.createNullResponse('formatting_error');
    }
  }

  /**
   * Validate data against schema
   */
  private validateAgainstSchema(
    data: unknown,
    schema: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Simple schema validation (would use Zod in production)
    try {
      const zodSchema = this.convertToZod(schema);
      zodSchema.parse(data);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(i => i.message),
        };
      }
      return { valid: false, errors: ['validation_failed'] };
    }
  }

  /**
   * Convert JSON schema to Zod schema
   */
  private convertToZod(schema: Record<string, unknown>): z.ZodType {
    const type = schema.type as string;

    switch (type) {
      case 'object':
        const properties = schema.properties as Record<string, unknown>;
        const shape: Record<string, z.ZodType> = {};
        
        for (const [key, prop] of Object.entries(properties)) {
          shape[key] = this.convertToZod(prop as Record<string, unknown>);
        }
        
        return z.object(shape);

      case 'array':
        const items = schema.items as Record<string, unknown>;
        return z.array(this.convertToZod(items));

      case 'string':
        return z.string();

      case 'number':
        return z.number();

      case 'integer':
        return z.number().int();

      case 'boolean':
        return z.boolean();

      case 'null':
        return z.null();

      default:
        return z.any();
    }
  }

  /**
   * Create null response with reason
   */
  private createNullResponse(reason: string, details?: string[]): unknown {
    return {
      error: null,
      reason,
      details: details || [],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create follow-up queries from research gaps
   */
  async generateFollowUpQueries(
    query: string,
    currentResults: unknown,
    gaps: string[]
  ): Promise<string[]> {
    const systemPrompt = `Generate 3-5 focused follow-up research questions based on knowledge gaps. Return as JSON array.`;

    const userPrompt = `Original query: ${query}\n\nKnowledge gaps: ${JSON.stringify(gaps)}\n\nGenerate follow-up questions.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      return parsed.queries || [];
    } catch (error) {
      console.error('[Formatter] Failed to generate follow-ups:', error);
      return [];
    }
  }
}

export const formatter = new Formatter();
