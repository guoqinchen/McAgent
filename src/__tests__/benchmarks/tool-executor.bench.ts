/**
 * Micro-benchmarks: ToolExecutor.
 *
 * Measures:
 *   - Single tool execution overhead
 *   - Batch execution throughput (10, 50, 100 tools)
 *   - Unknown tool lookup latency
 *   - JSON argument parsing overhead
 *   - Callback dispatch overhead
 */

import { describe, it, vi, beforeEach } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { ToolExecutor } from '../../agent/tool-executor.js';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';

// Mock metricsCollector to prevent side-effects
vi.mock('../../monitoring/metrics-collector.js', () => ({
  metricsCollector: {
    recordToolCall: vi.fn(),
    startRequest: vi.fn(),
    endRequest: vi.fn(),
    getSummary: vi.fn(() => ({ requests: 0 })),
    getMetrics: vi.fn(() => ({})),
  },
}));

function makeToolCall(
  id: string,
  name: string,
  args: string
): ChatCompletionMessageFunctionToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: args },
  } as ChatCompletionMessageFunctionToolCall;
}

describe('Micro-benchmark: ToolExecutor', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toolsByName: Map<string, any>;
  let executor: ToolExecutor;

  beforeEach(() => {
    toolsByName = new Map();
    executor = new ToolExecutor(toolsByName);
  });

  it('executeAll — single known tool call', async () => {
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockResolvedValue('ok'),
    });

    const call = makeToolCall('c1', 'echo', '{}');

    const result = await runBenchmark({
      name: 'ToolExecutor.executeAll — 1 known tool',
      fn: async () => {
        await executor.executeAll([call]);
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('executeAll — 10 known tool calls', async () => {
    for (let i = 0; i < 10; i++) {
      toolsByName.set(`tool_${i}`, {
        name: `tool_${i}`,
        execute: vi.fn().mockResolvedValue({ result: `ok_${i}` }),
      });
    }

    const calls: ChatCompletionMessageFunctionToolCall[] = [];
    for (let i = 0; i < 10; i++) {
      calls.push(makeToolCall(`c${i}`, `tool_${i}`, JSON.stringify({ index: i })));
    }

    const result = await runBenchmark({
      name: 'ToolExecutor.executeAll — 10 tools',
      fn: async () => {
        await executor.executeAll(calls);
      },
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('executeAll — 100 known tool calls', async () => {
    for (let i = 0; i < 20; i++) {
      toolsByName.set(`tool_${i}`, {
        name: `tool_${i}`,
        execute: vi.fn().mockResolvedValue({ result: `ok_${i}` }),
      });
    }

    const calls: ChatCompletionMessageFunctionToolCall[] = [];
    for (let i = 0; i < 100; i++) {
      calls.push(makeToolCall(`c${i}`, `tool_${i % 20}`, JSON.stringify({ index: i })));
    }

    const result = await runBenchmark({
      name: 'ToolExecutor.executeAll — 100 tools',
      fn: async () => {
        await executor.executeAll(calls);
      },
      samples: 20,
      warmupSamples: 3,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('executeAll — single unknown tool (fast fail)', async () => {
    const call = makeToolCall('c1', 'nonexistent', '{}');

    const result = await runBenchmark({
      name: 'ToolExecutor.executeAll — unknown tool',
      fn: async () => {
        await executor.executeAll([call]);
      },
      samples: 200,
      warmupSamples: 20,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('executeAll — with callbacks (onCall, onResult)', async () => {
    toolsByName.set('echo', {
      name: 'echo',
      execute: vi.fn().mockResolvedValue('ok'),
    });

    const onCall = vi.fn();
    const onResult = vi.fn();
    const call = makeToolCall('c1', 'echo', '{"msg":"hi"}');

    const result = await runBenchmark({
      name: 'ToolExecutor.executeAll — with callbacks',
      fn: async () => {
        await executor.executeAll([call], onCall, onResult);
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });
});
