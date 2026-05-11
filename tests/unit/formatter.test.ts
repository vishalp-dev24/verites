import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Formatter } from '../../src/formatter/index.js';

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: openAiMocks.create,
      },
    },
  })),
}));

describe('Formatter schema enforcement', () => {
  let formatter: Formatter;

  beforeEach(() => {
    openAiMocks.create.mockReset();
    formatter = new Formatter();
  });

  it('enforces documented shorthand schemas', async () => {
    openAiMocks.create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Verified summary',
            key_players: ['IBM', 'Google'],
          }),
        },
      }],
    });

    const result = await formatter.format({ raw: 'data' }, {
      summary: 'string',
      key_players: ['string'],
    });

    expect(result).toEqual({
      summary: 'Verified summary',
      key_players: ['IBM', 'Google'],
    });
  });

  it('does not silently accept unsupported schema types', async () => {
    openAiMocks.create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ anything: 'would have passed z.any before' }),
        },
      }],
    });

    await expect(formatter.format({ raw: 'data' }, {
      type: 'unsupported',
    })).rejects.toThrow('Formatted output failed schema validation');
  });

  it('rejects extra object fields by default', async () => {
    openAiMocks.create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Verified summary',
            unexpected: 'should not leak',
          }),
        },
      }],
    });

    await expect(formatter.format({ raw: 'data' }, {
      summary: 'string',
    })).rejects.toThrow('Formatted output failed schema validation');
  });
});
