import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  axios: {
    post: vi.fn(),
    isAxiosError: vi.fn((error: unknown) => {
      return Boolean(error && typeof error === 'object' && (error as { isAxiosError?: boolean }).isAxiosError);
    }),
  },
}));

vi.mock('axios', () => ({
  default: mocks.axios,
}));

import { SearchService } from '../../src/search/index.js';

const originalTavilyKey = process.env.TAVILY_API_KEY;
const originalExaKey = process.env.EXA_API_KEY;

describe('SearchService provider fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TAVILY_API_KEY = 'tavily-secret';
    process.env.EXA_API_KEY = 'exa-secret';
  });

  afterEach(() => {
    if (originalTavilyKey === undefined) {
      delete process.env.TAVILY_API_KEY;
    } else {
      process.env.TAVILY_API_KEY = originalTavilyKey;
    }

    if (originalExaKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = originalExaKey;
    }
  });

  it('falls back to Exa and does not log provider secrets from Axios errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.axios.post
      .mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed',
        code: 'ERR_BAD_RESPONSE',
        response: { status: 500 },
        config: { headers: { 'X-API-Key': 'tavily-secret' } },
      })
      .mockResolvedValueOnce({
        data: {
          results: [{
            url: 'https://example.com/research',
            title: 'Research',
            text: 'Evidence',
            published_date: '2026-05-11',
          }],
        },
      });

    const service = new SearchService();
    const results = await service.search('market research', { maxResults: 1 });

    expect(results).toEqual([{
      url: 'https://example.com/research',
      title: 'Research',
      content: 'Evidence',
      domain: 'example.com',
      published_date: '2026-05-11',
    }]);
    expect(warnSpy).toHaveBeenCalledWith('[Search] Tavily failed, falling back:', {
      provider: 'tavily',
      status: 500,
      code: 'ERR_BAD_RESPONSE',
      message: 'Request failed',
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('tavily-secret');

    warnSpy.mockRestore();
  });
});
