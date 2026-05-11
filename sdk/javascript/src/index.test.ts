import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ResearchClient } from './index';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    isAxiosError: vi.fn((error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError)),
  },
}));

const mockedAxios = vi.mocked(axios);

describe('ResearchClient response mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps failed job errors and completion timestamps', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        job_id: 'res_failed',
        session_id: 'session-1',
        mode: 'medium',
        status: 'failed',
        data: {},
        error: 'Formatter failed schema validation',
        created_at: '2026-05-11T10:00:00.000Z',
        completed_at: '2026-05-11T10:00:05.000Z',
      },
    });

    const client = new ResearchClient({
      apiKey: 'vts_test',
      baseUrl: 'https://api.example.test/v1',
    });

    const result = await client.getStatus('res_failed');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Formatter failed schema validation');
    expect(result.completedAt).toBe('2026-05-11T10:00:05.000Z');
  });
});
