import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '../agent/tool-executor.js';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';
// Mock metricsCollector to test it's called
vi.mock('../monitoring/metrics-collector.js', () => ({
  metricsCollector: {
    recordToolCall: vi.fn(),
    startRequest: vi.fn(),
    endRequest: vi.fn(),
    getSummary: vi.fn(() => ({ requests: 0 })),
    getMetrics: vi.fn(() => ({})),
  },
}));

function makeToolCall(
  overrides: Partial<ChatCompletionMessageFunctionToolCall> = {}
): ChatCompletionMessageFunctionToolCall {
  return {
    id: 'call_123',
    type: 'function',
    function: { name: 'echo', arguments: '{"msg":"hi"}' },
    ...overrides,
  } as ChatCompletionMessageFunctionToolCall;
}

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolsByName: Map<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onCall: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onResult: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onError: any;

  beforeEach(() => {
    vi.clearAllMocks();
    toolsByName = new Map();
    executor = new ToolExecutor(toolsByName);
    onCall = vi.fn();
    onResult = vi.fn();
    onError = vi.fn();
  });

  it('executes a known tool and returns results', async () => {
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockResolvedValue('hello back'),
    });

    const results = await executor.executeAll([makeToolCall()], onCall, onResult, onError);

    expect(results).toHaveLength(1);
    expect(results[0].toolCallId).toBe('call_123');
    expect(results[0].content).toBe(JSON.stringify('hello back'));
    expect(onCall).toHaveBeenCalledWith('echo', { msg: 'hi' });
    expect(onResult).toHaveBeenCalledWith('echo', 'hello back');
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports unknown tool without calling execute', async () => {
    const results = await executor.executeAll([makeToolCall()], onCall, onResult, onError);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Unknown tool');
    expect(onCall).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles tool execution error', async () => {
    const err = new Error('something broke');
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockRejectedValue(err),
    });

    const results = await executor.executeAll([makeToolCall()], onCall, onResult, onError);

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Tool execution failed');
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toContain('something broke');
  });

  it('parses tool arguments, falling back to {} on invalid JSON', async () => {
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockResolvedValue('ok'),
    });

    const badCall = makeToolCall({ function: { name: 'echo', arguments: '{bad json}' } });
    await executor.executeAll([badCall], onCall, onResult, onError);

    // Should have called execute with empty args, not thrown
    expect(toolsByName.get('echo').execute).toHaveBeenCalledWith({});
  });

  it('records metrics via recordToolCall on success', async () => {
    const { metricsCollector } = await import('../monitoring/metrics-collector.js');
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockResolvedValue('ok'),
    });

    await executor.executeAll([makeToolCall()]);

    expect(metricsCollector.recordToolCall).toHaveBeenCalledWith(expect.any(Number), true, 'echo');
  });

  it('records metrics on failure', async () => {
    const { metricsCollector } = await import('../monitoring/metrics-collector.js');
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockRejectedValue(new Error('fail')),
    });

    await executor.executeAll([makeToolCall()]);

    expect(metricsCollector.recordToolCall).toHaveBeenCalledWith(expect.any(Number), false, 'echo');
  });

  it('executes multiple tool calls and returns results in order', async () => {
    toolsByName.set('tool_a', { name: 'tool_a', execute: vi.fn().mockResolvedValue('a') });
    toolsByName.set('tool_b', { name: 'tool_b', execute: vi.fn().mockResolvedValue('b') });

    const calls = [
      makeToolCall({ id: 'c1', function: { name: 'tool_a', arguments: '{}' } }),
      makeToolCall({ id: 'c2', function: { name: 'tool_b', arguments: '{}' } }),
    ];

    const results = await executor.executeAll(calls, onCall, onResult);

    expect(results).toHaveLength(2);
    expect(results[0].toolCallId).toBe('c1');
    expect(results[1].toolCallId).toBe('c2');
    expect(onCall).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(2);
  });
});
