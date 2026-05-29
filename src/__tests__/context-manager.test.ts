import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  evictMessages,
  DEFAULT_MAX_CONTEXT_TOKENS,
} from '../context-manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates ~1 token per 4 ASCII chars', () => {
    const tokens = estimateTokens('hello world'); // 11 chars → ~3 tokens
    expect(tokens).toBeGreaterThanOrEqual(2);
    expect(tokens).toBeLessThanOrEqual(4);
  });

  it('estimates ~1 token per 2 CJK chars', () => {
    const tokens = estimateTokens('你好世界'); // 4 CJK chars → ~2 tokens
    expect(tokens).toBeGreaterThanOrEqual(2);
    expect(tokens).toBeLessThanOrEqual(4);
  });
});

describe('estimateMessageTokens', () => {
  it('counts tokens across multiple messages', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    const tokens = estimateMessageTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });

  it('includes tool call argument tokens', () => {
    const msgs: ChatCompletionMessageParam[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'test', arguments: '{"key":"value"}' },
          },
        ],
      },
    ];
    const tokens = estimateMessageTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('evictMessages', () => {
  it('never removes the first system message', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];

    const result = evictMessages(msgs, 10_000);
    expect(result[0]?.role).toBe('system');
    expect(result[0]?.content).toBe('You are helpful.');
  });

  it('removes oldest user/assistant pairs first when over limit', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'old user' },
      { role: 'assistant', content: 'old asst' },
      { role: 'user', content: 'recent user' },
      { role: 'assistant', content: 'recent asst' },
      { role: 'user', content: 'latest user' },
    ];

    // Very low limit + low minKeep forces eviction of oldest pair
    const result = evictMessages(msgs, 5, 3);
    expect(result.map((m) => m.content)).not.toContain('old user');
    expect(result.map((m) => m.content)).not.toContain('old asst');
  });

  it('preserves the most recent exchanges', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 20 }, (_, i) => [
        { role: 'user' as const, content: `user ${i}` },
        { role: 'assistant' as const, content: `asst ${i}` },
      ]).flat(),
    ];

    const result = evictMessages(msgs, 50);
    const contents = result.map((m) => m.content);
    expect(contents).toContain('user 19');
    expect(contents).toContain('asst 19');
  });

  it('returns the same array if under limit', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];

    const result = evictMessages(msgs, 10_000);
    expect(result.length).toBe(2);
  });

  it('handles empty array', () => {
    const result = evictMessages([], 1000);
    expect(result).toEqual([]);
  });

  it('keeps at least MIN_MESSAGES_TO_KEEP messages even when over limit', () => {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];

    // Very low limit should still keep a minimum
    const result = evictMessages(msgs, 1);
    expect(result.length).toBeGreaterThanOrEqual(3); // sys + at least 1 exchange
  });
});

describe('DEFAULT_MAX_CONTEXT_TOKENS', () => {
  it('is 900_000 (leaving ~148K headroom for DeepSeek V4 1M context)', () => {
    expect(DEFAULT_MAX_CONTEXT_TOKENS).toBe(900_000);
  });
});
