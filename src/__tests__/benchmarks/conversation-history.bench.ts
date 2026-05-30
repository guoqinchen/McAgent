/**
 * Micro-benchmarks: ConversationHistory operations.
 *
 * Measures:
 *   - Bulk add throughput (addUserMessage, addAssistantMessage)
 *   - Cache hit/miss latency (toPlainMessages)
 *   - getMessagesWithSystem (full pipeline: system prefix + eviction)
 *   - clear/reset throughput
 */

import { describe, it, beforeEach } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { ConversationHistory } from '../../agent/conversation.js';

describe('Micro-benchmark: ConversationHistory', () => {
  let conv: ConversationHistory;

  beforeEach(() => {
    conv = new ConversationHistory();
  });

  it('addUserMessage — single call latency', async () => {
    const result = await runBenchmark({
      name: 'ConversationHistory.addUserMessage — single call',
      fn: () => {
        conv.addUserMessage('hello');
        conv.clear();
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

  it('addUserMessage — bulk 100 calls', async () => {
    const result = await runBenchmark({
      name: 'ConversationHistory.addUserMessage — bulk 100',
      fn: () => {
        for (let i = 0; i < 100; i++) {
          conv.addUserMessage(`message ${i}`);
        }
        conv.clear();
      },
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

  it('toPlainMessages — cache hit (no mutation)', async () => {
    conv.addUserMessage('hello');
    conv.toPlainMessages(); // populate cache

    const result = await runBenchmark({
      name: 'ConversationHistory.toPlainMessages — cache hit',
      fn: () => void conv.toPlainMessages(),
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

  it('toPlainMessages — cache miss (after mutation)', async () => {
    conv.addUserMessage('hello');

    const result = await runBenchmark({
      name: 'ConversationHistory.toPlainMessages — cache miss',
      fn: () => {
        conv.addUserMessage('new');
        conv.toPlainMessages();
        conv.clear();
        conv.addUserMessage('hello');
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

  it('getMessagesWithSystem — 50 messages, no eviction', async () => {
    for (let i = 0; i < 50; i++) {
      conv.addUserMessage(`message ${i}`);
    }
    // run once to populate cache/state
    conv.getMessagesWithSystem('You are a bot.');
    // reset for consistent state
    conv.clear();
    for (let i = 0; i < 50; i++) {
      conv.addUserMessage(`message ${i}`);
    }

    const result = await runBenchmark({
      name: 'ConversationHistory.getMessagesWithSystem — 50 msgs',
      fn: () => void conv.getMessagesWithSystem('You are a bot.'),
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

  it('clear — single call latency', async () => {
    for (let i = 0; i < 100; i++) {
      conv.addUserMessage(`message ${i}`);
    }

    const result = await runBenchmark({
      name: 'ConversationHistory.clear — from 100 msgs',
      fn: () => {
        conv.clear();
        // Re-populate for next iteration
        for (let i = 0; i < 100; i++) {
          conv.addUserMessage(`message ${i}`);
        }
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
