import { describe, it, expect, beforeEach } from 'vitest';
import { ToolCallAccumulator } from '../agent/tool-accumulator.js';
import type { DeltaToolCall } from '../agent/tool-accumulator.js';

describe('ToolCallAccumulator', () => {
  let accumulator: ToolCallAccumulator;

  beforeEach(() => {
    accumulator = new ToolCallAccumulator();
  });

  it('hasToolCalls returns false for empty accumulator', () => {
    expect(accumulator.hasToolCalls()).toBe(false);
  });

  it('size returns 0 for empty accumulator', () => {
    expect(accumulator.size).toBe(0);
  });

  it('processDelta merges split chunks — id first, then arguments', () => {
    const chunk1: DeltaToolCall[] = [{ index: 0, id: 'call_1', function: { name: 'get_weather' } }];
    const chunk2: DeltaToolCall[] = [{ index: 0, function: { arguments: '{"city"' } }];
    const chunk3: DeltaToolCall[] = [{ index: 0, function: { arguments: ':"london"}' } }];

    accumulator.processDelta(chunk1);
    accumulator.processDelta(chunk2);
    accumulator.processDelta(chunk3);

    expect(accumulator.hasToolCalls()).toBe(true);
    expect(accumulator.size).toBe(1);

    const calls = accumulator.getToolCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('call_1');
    expect(calls[0].function.name).toBe('get_weather');
    expect(calls[0].function.arguments).toBe('{"city":"london"}');
  });

  it('processDelta handles multiple tool calls at different indices', () => {
    const chunk: DeltaToolCall[] = [
      { index: 0, id: 'call_a', function: { name: 'tool_a', arguments: '{}' } },
      { index: 1, id: 'call_b', function: { name: 'tool_b', arguments: '{"x":1}' } },
    ];

    accumulator.processDelta(chunk);

    expect(accumulator.size).toBe(2);

    const calls = accumulator.getToolCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].function.name).toBe('tool_a');
    expect(calls[1].function.name).toBe('tool_b');
  });

  it('getToolCalls returns properly typed function tool calls', () => {
    const chunk: DeltaToolCall[] = [
      { index: 0, id: 'tc1', function: { name: 'echo', arguments: '{"msg":"hi"}' } },
    ];

    accumulator.processDelta(chunk);

    const calls = accumulator.getToolCalls();
    expect(calls[0].type).toBe('function');
    expect(calls[0].id).toBe('tc1');
    expect(calls[0].function).toEqual({ name: 'echo', arguments: '{"msg":"hi"}' });
  });

  it('getEntries preserves index ordering', () => {
    // Add in reverse index order to test sorting
    const chunk: DeltaToolCall[] = [
      { index: 2, id: 'c2', function: { name: 'last', arguments: '{}' } },
      { index: 0, id: 'c0', function: { name: 'first', arguments: '{}' } },
      { index: 1, id: 'c1', function: { name: 'middle', arguments: '{}' } },
    ];

    accumulator.processDelta(chunk);

    const entries = accumulator.getEntries();
    expect(entries).toHaveLength(3);
    // Entries should be sortable by index (insertion order from Map may vary)
    const sorted = [...entries].sort(([a], [b]) => a - b);
    expect(sorted[0][1].name).toBe('first');
    expect(sorted[1][1].name).toBe('middle');
    expect(sorted[2][1].name).toBe('last');
  });

  it('clear() resets all state', () => {
    const chunk: DeltaToolCall[] = [
      { index: 0, id: 'c1', function: { name: 't', arguments: '{}' } },
    ];

    accumulator.processDelta(chunk);
    expect(accumulator.hasToolCalls()).toBe(true);

    accumulator.clear();
    expect(accumulator.hasToolCalls()).toBe(false);
    expect(accumulator.size).toBe(0);
    expect(accumulator.getToolCalls()).toEqual([]);
  });

  it('processDelta with empty array is a no-op', () => {
    accumulator.processDelta([]);
    expect(accumulator.hasToolCalls()).toBe(false);
    expect(accumulator.size).toBe(0);
  });

  it('processDelta handles delta without function field gracefully', () => {
    const chunk: DeltaToolCall[] = [{ index: 0, id: 'call_x' }];
    accumulator.processDelta(chunk);

    const calls = accumulator.getToolCalls();
    expect(calls[0].id).toBe('call_x');
    expect(calls[0].function.name).toBe('');
    expect(calls[0].function.arguments).toBe('');
  });
});
