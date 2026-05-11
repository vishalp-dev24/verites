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
        throw new Error('Formatter returned an empty response');
      }

      const parsed = JSON.parse(content);

      // Validate against schema
      const validation = this.validateAgainstSchema(parsed, schema);
      if (!validation.valid) {
        console.warn('[Formatter] Schema validation failed:', validation.errors);
        throw new Error(`Formatted output failed schema validation: ${validation.errors.join('; ')}`);
      }

      return validation.data;
    } catch (error) {
      console.error('[Formatter] Formatting error:', error);
      throw error instanceof Error ? error : new Error('Formatter failed');
    }
  }

  /**
   * Validate data against schema
   */
  private validateAgainstSchema(
    data: unknown,
    schema: Record<string, unknown>
  ): { valid: boolean; errors: string[]; data?: unknown } {
    // Simple schema validation (would use Zod in production)
    try {
      const zodSchema = this.convertToZod(schema);
      const parsed = zodSchema.parse(data);
      return { valid: true, errors: [], data: parsed };
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
  private convertToZod(schema: unknown): z.ZodType {
    if (typeof schema === 'string') {
      return this.primitiveToZod(schema);
    }

    if (Array.isArray(schema)) {
      if (schema.length !== 1) {
        throw new Error('Array shorthand schemas must contain exactly one item schema');
      }
      return z.array(this.convertToZod(schema[0]));
    }

    const record = this.asRecord(schema);
    const type = typeof record.type === 'string' ? record.type : undefined;

    if (!type) {
      const shape: Record<string, z.ZodType> = {};
      for (const [key, prop] of Object.entries(record)) {
        shape[key] = this.convertToZod(prop);
      }
      return z.object(shape).strict();
    }

    switch (type) {
      case 'object':
        const properties = this.asRecord(record.properties);
        const shape: Record<string, z.ZodType> = {};

        for (const [key, prop] of Object.entries(properties)) {
          shape[key] = this.convertToZod(prop);
        }

        const objectSchema = z.object(shape);
        return record.additionalProperties === true ? objectSchema.passthrough() : objectSchema.strict();

      case 'array':
        if (!('items' in record)) {
          throw new Error('Array schemas must define items');
        }
        return z.array(this.convertToZod(record.items));

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
        throw new Error(`Unsupported schema type: ${type}`);
    }
  }

  private primitiveToZod(type: string): z.ZodType {
    switch (type) {
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
        throw new Error(`Unsupported schema shorthand: ${type}`);
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
