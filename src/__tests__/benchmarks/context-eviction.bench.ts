/**
 * Micro-benchmarks: Context eviction (evictMessages).
 *
 * Measures throughput of the eviction algorithm across:
 * different message counts (50, 200, 500, 1000, 2000),
 * different token budgets (generous, tight, extreme),
 * and edge cases (empty, already-under-limit, all-eviction).
 */

import { describe, it } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { evictMessages } from '../../context-manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Test data ──────────────────────────────────────────────────────────────

function generateMessages(count: number): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helpful assistant running on macOS.' },
  ];
  for (let i = 0; i < count; i++) {
    msgs.push({
      role: 'user',
      content: `This is user message number ${i}. It contains some text to be realistic for token estimation purposes.`,
    });
    msgs.push({
      role: 'assistant',
      content: `This is assistant response number ${i}. It also has enough text content to simulate real conversation patterns in the McAgent system.`,
    });
  }
  return msgs;
}

const MSG_50 = generateMessages(25); // 1 sys + 50 = 51
const MSG_200 = generateMessages(100); // 1 sys + 200 = 201
const MSG_500 = generateMessages(250); // 1 sys + 500 = 501
const MSG_1000 = generateMessages(500); // 1 sys + 1000 = 1001
const MSG_2000 = generateMessages(1000); // 1 sys + 2000 = 2001

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe('Micro-benchmark: Context Eviction (evictMessages)', () => {
  it('50 messages — generous budget (no eviction)', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 50 msgs, generous budget',
      fn: () => void evictMessages(MSG_50, 999_999),
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

  it('50 messages — tight budget (moderate eviction)', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 50 msgs, tight budget',
      fn: () => void evictMessages(MSG_50, 100),
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

  it('200 messages — moderate budget', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 200 msgs, moderate budget',
      fn: () => void evictMessages(MSG_200, 500),
      samples: 30,
      warmupSamples: 3,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('500 messages — tight budget (aggressive eviction)', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 500 msgs, tight budget',
      fn: () => void evictMessages(MSG_500, 100),
      samples: 30,
      warmupSamples: 3,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('1000 messages — moderate budget', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 1000 msgs, moderate budget',
      fn: () => void evictMessages(MSG_1000, 1000),
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

  it('2000 messages — generous budget (scan only)', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 2000 msgs, generous budget',
      fn: () => void evictMessages(MSG_2000, 999_999),
      samples: 10,
      warmupSamples: 2,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('2000 messages — extreme budget (max eviction)', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — 2000 msgs, extreme budget',
      fn: () => void evictMessages(MSG_2000, 5),
      samples: 10,
      warmupSamples: 2,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });

  it('Empty array — fast path', async () => {
    const result = await runBenchmark({
      name: 'evictMessages — empty array',
      fn: () => void evictMessages([], 1000),
      samples: 200,
      warmupSamples: 20,
      iterationsPerSample: 10,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });
});
