import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResearch } from './api';

describe('dashboard API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits research using only backend-accepted snake_case fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job_id: 'res_1',
      status: 'queued',
      estimated_time: 30,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createResearch({
      query: '  verify claim  ',
      mode: 'medium',
      output_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
      },
      session_id: 'session-1',
      custom_instructions: 'do not send this to the strict backend',
    });

    expect(response.error).toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      query: 'verify claim',
      mode: 'medium',
      session_id: 'session-1',
      output_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
      },
    });
    expect(body).not.toHaveProperty('sessionId');
    expect(body).not.toHaveProperty('outputSchema');
    expect(body).not.toHaveProperty('custom_instructions');
  });

  it('uses a valid JSON schema default when none is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      job_id: 'res_2',
      status: 'queued',
      estimated_time: 30,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await createResearch({
      query: 'verify claim',
      mode: 'lite',
      session_id: 'session-2',
    });

    expect(response.error).toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.output_schema).toEqual({
      type: 'object',
      properties: {
        summary: { type: 'string' },
        key_facts: {
          type: 'array',
          items: { type: 'string' },
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
  });
});
