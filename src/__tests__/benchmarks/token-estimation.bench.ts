/**
 * Micro-benchmarks: Token estimation.
 *
 * Measures throughput of estimateTokens() across different input types:
 * ASCII, CJK, mixed, empty, short, long, tool-call-laden messages.
 */

import { describe, it, expect } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { estimateTokens, estimateMessageTokens } from '../../context-manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Test data ──────────────────────────────────────────────────────────────

const ASCII_100B = 'The quick brown fox jumps over the lazy dog. '.repeat(2); // ~100 chars
const ASCII_1KB = 'The quick brown fox jumps over the lazy dog. '.repeat(25); // ~1KB
const ASCII_10KB = 'The quick brown fox jumps over the lazy dog. '.repeat(250); // ~10KB
const ASCII_100KB = 'The quick brown fox jumps over the lazy dog. '.repeat(2500); // ~100KB

const CJK_100B = '你好世界这是一个性能测试中文字符串'.repeat(2);
const CJK_1KB = '你好世界这是一个性能测试中文字符串'.repeat(25);
const CJK_10KB = '你好世界这是一个性能测试中文字符串'.repeat(250);

const MIXED_1KB = 'Hello 你好 World 世界 Test 测试 '.repeat(34);
const MIXED_10KB = 'Hello 你好 World 世界 Test 测试 '.repeat(334);

const EMPTY = '';

let toolCallMessages: ChatCompletionMessageParam[] | null = null;
function getToolCallMessages(): ChatCompletionMessageParam[] {
  if (toolCallMessages) return toolCallMessages;
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
  toolCallMessages = msgs;
  return msgs;
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('Micro-benchmark: Token Estimation', () => {
  // ── Single-call latency ──────────────────────────────────────────────────

  it('ASCII 100B — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — ASCII 100B',
      fn: () => estimateTokens(ASCII_100B),
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

  it('ASCII 1KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — ASCII 1KB',
      fn: () => estimateTokens(ASCII_1KB),
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

  it('ASCII 10KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — ASCII 10KB',
      fn: () => estimateTokens(ASCII_10KB),
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

  it('ASCII 100KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — ASCII 100KB',
      fn: () => estimateTokens(ASCII_100KB),
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

  it('CJK 1KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — CJK 1KB',
      fn: () => estimateTokens(CJK_1KB),
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

  it('CJK 10KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — CJK 10KB',
      fn: () => estimateTokens(CJK_10KB),
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

  it('Mixed ASCII/CJK 10KB — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — Mixed 10KB',
      fn: () => estimateTokens(MIXED_10KB),
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

  it('Empty string — single call latency', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — Empty string',
      fn: () => estimateTokens(EMPTY),
      samples: 200,
      warmupSamples: 20,
      iterationsPerSample: 100,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  // ── Throughput ───────────────────────────────────────────────────────────

  it('ASCII 100B — throughput (10K calls/sample)', async () => {
    const result = await runBenchmark({
      name: 'estimateTokens — ASCII 100B × 10K calls',
      fn: () => estimateTokens(ASCII_100B),
      samples: 30,
      warmupSamples: 5,
      iterationsPerSample: 10_000,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  // ── Message token estimation ─────────────────────────────────────────────

  it('estimateMessageTokens — 201 messages (100 exchanges)', async () => {
    const msgs = getToolCallMessages();
    const result = await runBenchmark({
      name: 'estimateMessageTokens — 201 msgs with tool_calls',
      fn: () => estimateMessageTokens(msgs),
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
});
