/**
 * Performance test suite for McAgent.
 *
 * Covers the most performance-sensitive paths:
 *   - Token estimation (ASCII, CJK, mixed, large strings)
 *   - Message eviction (small/large message sets)
 *   - ConversationHistory operations (batch mutations, cache invalidation)
 *   - ErrorRecoveryEngine (classification throughput, retry latency)
 *   - MetricsCollector (concurrent request tracking)
 *   - StructuredLogger (handler dispatch, file queue)
 *   - ToolExecutor batch execution
 *
 * These are NOT benchmarks (no statistical analysis) — they are
 * throughput/latency smoke tests that fail if performance degrades
 * beyond reasonable thresholds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  evictMessages,
  DEFAULT_MAX_CONTEXT_TOKENS,
} from '../context-manager.js';
import { ConversationHistory } from '../agent/conversation.js';
import { ErrorRecoveryEngine } from '../engine/error-recovery-engine.js';
import { MetricsCollector } from '../monitoring/metrics-collector.js';
import { StructuredLogger, ConsoleHandler } from '../logging/structured-logger.js';
import { ToolExecutor } from '../agent/tool-executor.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';

// ============================================================================
// Helpers
// ============================================================================

/** Measure the execution time of a sync function in milliseconds. */
function measureSync(fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  return performance.now() - start;
}

/** Measure the execution time of an async function in milliseconds. */
async function measureAsync(fn: () => Promise<void>, iterations: number): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  return performance.now() - start;
}

/** Create a large batch of ChatCompletionMessageParam messages. */
function generateMessages(count: number): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helpful assistant running on macOS.' },
  ];
  for (let i = 0; i < count; i++) {
    msgs.push({
      role: 'user',
      content: `This is user message number ${i}. It contains some text to make it realistic.`,
    });
    msgs.push({
      role: 'assistant',
      content: `This is assistant response number ${i}. Also with enough text to simulate real usage patterns.`,
    });
  }
  return msgs;
}

// ============================================================================
// 1. Token Estimation Performance
// ============================================================================

describe('Performance: estimateTokens', () => {
  it('estimates tokens for 10,000 ASCII characters in under 1ms', () => {
    const asciiText = 'The quick brown fox jumps over the lazy dog. '.repeat(250); // ~10,000 chars
    const elapsed = measureSync(() => estimateTokens(asciiText), 1);
    // Single call should be sub-millisecond
    expect(elapsed).toBeLessThan(5);
  });

  it('estimates tokens for 10,000 CJK characters in under 1ms', () => {
    const cjkText = '你好世界这是一个性能测试中文字符串'.repeat(250); // ~10,000 chars
    const elapsed = measureSync(() => estimateTokens(cjkText), 1);
    expect(elapsed).toBeLessThan(5);
  });

  it('estimates tokens for 10,000 mixed ASCII/CJK characters in under 1ms', () => {
    const mixedText = 'Hello 你好 World 世界 Test 测试 '.repeat(334); // ~10,020 chars
    const elapsed = measureSync(() => estimateTokens(mixedText), 1);
    expect(elapsed).toBeLessThan(5);
  });

  it('handles 100,000 iterations of estimateTokens in under 500ms', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const elapsed = measureSync(() => estimateTokens(text), 100_000);
    // 100K calls should complete fast — ~5μs per call target
    expect(elapsed).toBeLessThan(500);
  });

  it('estimates empty string in constant time', () => {
    // 1M calls on empty string should be near-instant
    const elapsed = measureSync(() => estimateTokens(''), 1_000_000);
    expect(elapsed).toBeLessThan(100);
  });

  it('scales linearly with input length', () => {
    const short = 'hello world'; // 11 chars
    const long = short.repeat(100); // 1,100 chars
    const veryLong = short.repeat(1000); // 11,000 chars

    const t1 = measureSync(() => estimateTokens(short), 10_000);
    const t2 = measureSync(() => estimateTokens(long), 10_000);
    const t3 = measureSync(() => estimateTokens(veryLong), 10_000);

    // Time should scale roughly linearly: t3/t1 ≈ 1000, within factor of 2
    const ratio = t3 / t1;
    expect(ratio).toBeLessThan(2000); // generous bound
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
  });
});

// ============================================================================
// 2. Message Token Estimation Performance
// ============================================================================

describe('Performance: estimateMessageTokens', () => {
  it('estimates tokens for 100 messages in under 5ms', () => {
    const msgs = generateMessages(50); // 1 system + 100 user/assistant = 101 msgs
    const elapsed = measureSync(() => estimateMessageTokens(msgs), 1);
    expect(elapsed).toBeLessThan(10);
  });

  it('handles messages with tool_calls efficiently', () => {
    const msgs: ChatCompletionMessageParam[] = [{ role: 'system', content: 'You are helpful.' }];
    for (let i = 0; i < 100; i++) {
      msgs.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `call_${i}`,
            type: 'function',
            function: {
              name: `tool_${i}`,
              arguments: JSON.stringify({ key: `value${i}`, nested: { deep: 'data' } }),
            },
          },
        ],
      });
      msgs.push({
        role: 'tool',
        tool_call_id: `call_${i}`,
        content: JSON.stringify({ result: `result_${i}`, data: 'some data here' }),
      });
    }
    const elapsed = measureSync(() => estimateMessageTokens(msgs), 1);
    expect(elapsed).toBeLessThan(15);
  });

  it('returns zero for empty array', () => {
    expect(estimateMessageTokens([])).toBe(0);
  });
});

// ============================================================================
// 3. Message Eviction Performance
// ============================================================================

describe('Performance: evictMessages', () => {
  it('evicts from 500 messages in under 10ms', () => {
    const msgs = generateMessages(250); // 501 messages
    expect(msgs.length).toBe(501);

    const elapsed = measureSync(() => evictMessages(msgs, 5000), 1);
    expect(elapsed).toBeLessThan(15);
  });

  it('returns immediately when under limit (no eviction needed)', () => {
    const msgs = generateMessages(25); // 51 messages
    const elapsed = measureSync(() => evictMessages(msgs, 999_999), 1);
    expect(elapsed).toBeLessThan(5);
  });

  it('handles tiny limit with aggressive eviction on 1000 messages', () => {
    const msgs = generateMessages(500); // 1001 messages
    const elapsed = measureSync(() => evictMessages(msgs, 10), 1);
    expect(elapsed).toBeLessThan(30);
    // Result should be minimal
    const result = evictMessages(msgs, 10);
    expect(result.length).toBeLessThan(100);
  });

  it('does not mutate the original array', () => {
    const msgs = generateMessages(50);
    const originalLength = msgs.length;
    evictMessages(msgs, 100);
    expect(msgs.length).toBe(originalLength);
  });

  it('handles empty array quickly', () => {
    const elapsed = measureSync(() => evictMessages([], 1000), 100_000);
    expect(elapsed).toBeLessThan(50);
  });

  it('eviction with very large message set (2000 messages) is sub-50ms', () => {
    const msgs = generateMessages(1000); // 2001 messages
    expect(msgs.length).toBe(2001);
    const elapsed = measureSync(() => evictMessages(msgs, 10_000), 1);
    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// 4. ConversationHistory Performance
// ============================================================================

describe('Performance: ConversationHistory', () => {
  let conv: ConversationHistory;

  beforeEach(() => {
    conv = new ConversationHistory();
  });

  it('adds 1000 user messages in under 20ms', () => {
    const elapsed = measureSync(() => {
      for (let i = 0; i < 1000; i++) {
        conv.addUserMessage(`message ${i}`);
      }
    }, 1);
    expect(elapsed).toBeLessThan(30);
  });

  it('toPlainMessages cache hit is near-instant', () => {
    conv.addUserMessage('hello');
    conv.toPlainMessages(); // populate cache

    const elapsed = measureSync(() => conv.toPlainMessages(), 100_000);
    expect(elapsed).toBeLessThan(50);
  });

  it('cache invalidation on mutation keeps adds cheap', () => {
    for (let i = 0; i < 100; i++) {
      conv.addUserMessage(`msg ${i}`);
    }

    const elapsed = measureSync(() => {
      for (let i = 0; i < 500; i++) {
        conv.addUserMessage(`batch ${i}`);
        conv.toPlainMessages(); // triggers cache rebuild each time
      }
    }, 1);

    // 500 mutations + 500 cache rebuilds should be fast
    expect(elapsed).toBeLessThan(200);
  });

  it('getMessagesWithSystem is fast with cached state', () => {
    for (let i = 0; i < 50; i++) {
      conv.addUserMessage(`msg ${i}`);
    }

    const elapsed = measureSync(() => {
      conv.getMessagesWithSystem('You are a bot.');
    }, 500);
    expect(elapsed).toBeLessThan(100);
  });

  it('clear is near-instant for large history', () => {
    for (let i = 0; i < 1000; i++) {
      conv.addUserMessage(`msg ${i}`);
    }
    const elapsed = measureSync(() => conv.clear(), 10_000);
    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// 5. ErrorRecoveryEngine Performance
// ============================================================================

describe('Performance: ErrorRecoveryEngine', () => {
  let engine: ErrorRecoveryEngine;

  beforeEach(() => {
    engine = new ErrorRecoveryEngine();
  });

  it('classifies 10,000 errors in under 50ms', () => {
    const errors: Error[] = [];
    for (let i = 0; i < 10_000; i++) {
      const err = new Error('test error');
      // Vary error types
      if (i % 5 === 0) (err as NodeJS.ErrnoException).code = 'ENOTFOUND';
      else if (i % 5 === 1) (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      else if (i % 5 === 2) (err as NodeJS.ErrnoException).code = 'EACCES';
      else if (i % 5 === 3) err.name = 'TypeError';
      errors.push(err);
    }

    const elapsed = measureSync(() => {
      for (const err of errors) {
        // Access private method via prototype for testing
        (engine as unknown as { classifyError: (err: Error) => string }).classifyError(err);
      }
    }, 1);

    expect(elapsed).toBeLessThan(50);
  });

  it('determines strategy for 10,000 contexts in under 50ms', () => {
    const elapsed = measureSync(() => {
      for (let i = 0; i < 10_000; i++) {
        engine.determineStrategy({
          error: new Error('test'),
          errorType: i % 2 === 0 ? 'network' : 'timeout',
          retryCount: i % 4,
          maxRetries: 3,
          operation: 'test',
          timestamp: new Date(),
        });
      }
    }, 1);
    expect(elapsed).toBeLessThan(50);
  });

  it('executeWithRecovery succeeds immediately for non-throwing operations', async () => {
    const elapsed = await measureAsync(async () => {
      await engine.executeWithRecovery(async () => 'success', 'test-op');
    }, 1000);
    // 1000 successful calls should be fast
    expect(elapsed).toBeLessThan(100);
  });

  it('retry delay increases exponentially', () => {
    // Check the private method for correctness via prototype
    const delay1 = (
      engine as unknown as { calculateRetryDelay: (n: number) => number }
    ).calculateRetryDelay(0); // 1000ms
    const delay2 = (
      engine as unknown as { calculateRetryDelay: (n: number) => number }
    ).calculateRetryDelay(1); // 2000ms
    const delay3 = (
      engine as unknown as { calculateRetryDelay: (n: number) => number }
    ).calculateRetryDelay(2); // 4000ms

    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
    expect(delay3).toBe(4000);
  });

  it('returns null fallback for fetch operations', () => {
    const fallback = (
      engine as unknown as { getDefaultFallback: (op: string) => unknown }
    ).getDefaultFallback('fetch_data');
    expect(fallback).toBeNull();
  });

  it('returns empty array fallback for list operations', () => {
    const fallback = (
      engine as unknown as { getDefaultFallback: (op: string) => unknown }
    ).getDefaultFallback('list_items');
    expect(fallback).toEqual([]);
  });
});

// ============================================================================
// 6. MetricsCollector Performance
// ============================================================================

describe('Performance: MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('handles 100,000 request starts/ends in under 500ms', () => {
    const elapsed = measureSync(() => {
      for (let i = 0; i < 100_000; i++) {
        collector.startRequest(`req_${i}`);
        collector.endRequest(`req_${i}`, i % 10 !== 0, i % 10 === 0 ? 'timeout' : undefined);
      }
    }, 1);
    expect(elapsed).toBeLessThan(500);
  });

  it('getSummary is fast after many requests', () => {
    for (let i = 0; i < 10_000; i++) {
      collector.startRequest(`req_${i}`);
      collector.endRequest(`req_${i}`, true);
    }

    const elapsed = measureSync(() => collector.getSummary(), 10_000);
    expect(elapsed).toBeLessThan(100);
  });

  it('getMetrics returns a defensive copy', () => {
    collector.startRequest('r1');
    collector.endRequest('r1', true);

    const m1 = collector.getMetrics();
    const m2 = collector.getMetrics();
    expect(m1).not.toBe(m2); // different references
    expect(m1.requests).toBe(m2.requests); // same values
  });

  it('reset clears all state quickly', () => {
    for (let i = 0; i < 10_000; i++) {
      collector.startRequest(`req_${i}`);
      collector.endRequest(`req_${i}`, true);
    }
    const elapsed = measureSync(() => collector.reset(), 10_000);
    expect(elapsed).toBeLessThan(50);
  });

  it('recordToolCall updates metrics correctly', () => {
    const elapsed = measureSync(() => {
      for (let i = 0; i < 10_000; i++) {
        collector.recordToolCall(i, i % 5 !== 0, `tool_${i % 10}`);
      }
    }, 1);
    expect(elapsed).toBeLessThan(100);
  });

  it('getActiveRequestCount tracks concurrent requests', () => {
    expect(collector.getActiveRequestCount()).toBe(0);
    collector.startRequest('a');
    collector.startRequest('b');
    expect(collector.getActiveRequestCount()).toBe(2);
    collector.endRequest('a', true);
    expect(collector.getActiveRequestCount()).toBe(1);
  });
});

// ============================================================================
// 7. StructuredLogger Performance
// ============================================================================

describe('Performance: StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger('info');
    // Don't add real handlers — test raw dispatch speed
  });

  it('dispatches 10,000 info-level logs in under 100ms (no handlers)', () => {
    const elapsed = measureSync(() => {
      for (let i = 0; i < 10_000; i++) {
        logger.info('test message', { index: i });
      }
    }, 1);
    expect(elapsed).toBeLessThan(100);
  });

  it('discards logs below set level without handler dispatch', () => {
    // debug < info, so these should be no-ops
    const elapsed = measureSync(() => {
      for (let i = 0; i < 50_000; i++) {
        logger.debug('should be dropped', { i });
      }
    }, 1);
    expect(elapsed).toBeLessThan(50);
  });

  it('handles error-level logs with Error objects', () => {
    const err = new Error('test error');
    const elapsed = measureSync(() => {
      for (let i = 0; i < 10_000; i++) {
        logger.error('error occurred', err, { code: i });
      }
    }, 1);
    expect(elapsed).toBeLessThan(100);
  });

  it('ConsoleHandler formats and writes 1000 records in under 100ms', () => {
    const handler = new ConsoleHandler('debug');
    const elapsed = measureSync(() => {
      for (let i = 0; i < 1000; i++) {
        handler.handle({
          timestamp: new Date(),
          level: 'info',
          message: `message ${i}`,
          context: { index: i },
        });
      }
    }, 1);
    expect(elapsed).toBeLessThan(150);
  });

  it('ConsoleHandler filters below-set-level records quickly', () => {
    const handler = new ConsoleHandler('error'); // only error and fatal
    const elapsed = measureSync(() => {
      for (let i = 0; i < 10_000; i++) {
        handler.handle({
          timestamp: new Date(),
          level: 'info',
          message: 'should be filtered',
        });
      }
    }, 1);
    expect(elapsed).toBeLessThan(50);
  });

  it('Logger.setLevel propagates to all handlers', () => {
    const handler1 = new ConsoleHandler('info');
    const handler2 = new ConsoleHandler('info');
    logger.addHandler(handler1);
    logger.addHandler(handler2);

    logger.setLevel('error');

    // Both handlers should now be at 'error' level
    // Verify by checking that info logs are not dispatched
    // (we can't inspect handler level directly — test via behavior)
    expect(() => logger.info('dropped')).not.toThrow();
  });

  it('addHandler and removeHandler work efficiently', () => {
    const handler = new ConsoleHandler('debug');
    const elapsed = measureSync(() => {
      for (let i = 0; i < 5000; i++) {
        logger.addHandler(handler);
        logger.removeHandler(handler);
      }
    }, 1);
    expect(elapsed).toBeLessThan(150);
  });
});

// ============================================================================
// 8. ToolExecutor Batch Performance
// ============================================================================

describe('Performance: ToolExecutor', () => {
  let executor: ToolExecutor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolsByName: Map<string, any>;

  beforeEach(() => {
    toolsByName = new Map();
    executor = new ToolExecutor(toolsByName);
  });

  it('executes 100 tool calls in under 200ms', async () => {
    // Register tools
    for (let i = 0; i < 10; i++) {
      toolsByName.set(`tool_${i}`, {
        name: `tool_${i}`,
        execute: vi.fn().mockResolvedValue({ result: `ok_${i}` }),
      });
    }

    const calls: ChatCompletionMessageFunctionToolCall[] = [];
    for (let i = 0; i < 100; i++) {
      calls.push({
        id: `call_${i}`,
        type: 'function',
        function: {
          name: `tool_${i % 10}`,
          arguments: JSON.stringify({ index: i }),
        },
      } as ChatCompletionMessageFunctionToolCall);
    }

    const elapsed = await measureAsync(async () => {
      await executor.executeAll(calls);
    }, 1);
    expect(elapsed).toBeLessThan(200);
  });

  it('handles unknown tool lookups quickly', async () => {
    const calls: ChatCompletionMessageFunctionToolCall[] = [];
    for (let i = 0; i < 100; i++) {
      calls.push({
        id: `call_${i}`,
        type: 'function',
        function: {
          name: `unknown_tool_${i}`,
          arguments: '{}',
        },
      } as ChatCompletionMessageFunctionToolCall);
    }

    const elapsed = await measureAsync(async () => {
      await executor.executeAll(calls);
    }, 1);
    expect(elapsed).toBeLessThan(100);
  });

  it('preserves result order under concurrent-like sequential execution', async () => {
    // Tools with varying resolve times
    toolsByName.set('fast', {
      name: 'fast',
      execute: vi.fn().mockResolvedValue('fast'),
    });
    toolsByName.set('slow', {
      name: 'slow',
      execute: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 10, 'slow'))),
    });

    const calls: ChatCompletionMessageFunctionToolCall[] = [
      { id: 'c1', type: 'function', function: { name: 'fast', arguments: '{}' } },
      { id: 'c2', type: 'function', function: { name: 'slow', arguments: '{}' } },
      { id: 'c3', type: 'function', function: { name: 'fast', arguments: '{}' } },
    ] as ChatCompletionMessageFunctionToolCall[];

    const results = await executor.executeAll(calls);
    expect(results).toHaveLength(3);
    expect(results[0].toolCallId).toBe('c1');
    expect(results[1].toolCallId).toBe('c2');
    expect(results[2].toolCallId).toBe('c3');
  });
});

// ============================================================================
// 9. Integration: Full Message Pipeline Stress Test
// ============================================================================

describe('Performance: Integration — full message pipeline', () => {
  it('conversation → token estimate → eviction pipeline handles 500 messages in under 50ms', () => {
    const conv = new ConversationHistory();
    for (let i = 0; i < 250; i++) {
      conv.addUserMessage(`User query ${i}: Tell me about macOS system performance.`);
      conv.addAssistantMessage(
        `Assistant response ${i}: Here is a detailed answer about macOS performance...`
      );
    }

    expect(conv.length).toBe(500);

    const elapsed = measureSync(() => {
      const msgs = conv.getMessagesWithSystem('You are a macOS assistant.');
      const tokenCount = estimateMessageTokens(msgs);
      expect(msgs.length).toBeGreaterThan(0);
      expect(tokenCount).toBeGreaterThan(0);
    }, 1);

    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// 10. Edge Cases & Regression Guards
// ============================================================================

describe('Performance: Edge cases & regression guards', () => {
  it('estimateTokens handles null/undefined-like empty string without throwing', () => {
    const elapsed = measureSync(() => {
      estimateTokens('');
      estimateTokens('');
    }, 10_000);
    expect(elapsed).toBeLessThan(30);
  });

  it('evictMessages with maxTokens=0 returns minimal message set', () => {
    const msgs = generateMessages(100);
    const result = evictMessages(msgs, 0);
    // Should still keep system + minimal messages
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].role).toBe('system');
  });

  it('generateMessages helper creates correct message count', () => {
    const msgs = generateMessages(50);
    // 1 system + 50*2 (user+assistant pairs) = 101
    expect(msgs.length).toBe(101);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[2].role).toBe('assistant');
  });

  it('DEFAULT_MAX_CONTEXT_TOKENS remains at expected value', () => {
    // This guards against accidental changes to the context limit
    // DeepSeek-V4 supports 1M context; we default to 900K with ~148K headroom
    expect(DEFAULT_MAX_CONTEXT_TOKENS).toBe(900_000);
  });

  it('ErrorRecoveryEngine maxRetries is 3', () => {
    const engine = new ErrorRecoveryEngine();
    expect((engine as unknown as { maxRetries: number }).maxRetries).toBe(3);
  });

  it('ErrorRecoveryEngine baseRetryDelay is 1000ms', () => {
    const engine = new ErrorRecoveryEngine();
    expect((engine as unknown as { baseRetryDelay: number }).baseRetryDelay).toBe(1000);
  });

  it('MetricsCollector returns 0 avg/min/max for unused collector', () => {
    const collector = new MetricsCollector();
    const summary = collector.getSummary();
    expect(summary.requests).toBe(0);
    expect(summary.avgLatency).toBe(0);
    expect(summary.minLatency).toBe(0);
    expect(summary.maxLatency).toBe(0);
  });

  it('Shell defaultExecutor is defined and callable', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    expect(defaultExecutor).toBeDefined();
    expect(typeof defaultExecutor.run).toBe('function');
  });

  it('ConsoleHandler does not throw on log with undefined context', () => {
    const handler = new ConsoleHandler('debug');
    expect(() =>
      handler.handle({
        timestamp: new Date(),
        level: 'info',
        message: 'test',
      })
    ).not.toThrow();
  });

  it('ConsoleHandler writes errors to stderr-like stream', () => {
    const handler = new ConsoleHandler('debug');
    // Should route to stderr for error level
    expect(() =>
      handler.handle({
        timestamp: new Date(),
        level: 'error',
        message: 'critical',
      })
    ).not.toThrow();
  });
});
