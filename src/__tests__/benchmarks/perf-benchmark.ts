/**
 * Performance benchmark — measures key hot-path operations.
 *
 * Run: npx tsx src/__tests__/benchmarks/perf-benchmark.ts
 */

import { estimateTokens, evictMessages } from '../../context-manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateLongConversation(
  numExchanges: number,
  avgContentLen: number
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
  ];
  for (let i = 0; i < numExchanges; i++) {
    const userContent = 'Test question '.repeat(avgContentLen / 15);
    messages.push({ role: 'user', content: userContent });
    const assistantContent =
      '# Heading\n\n**Bold** text with `code` and [links](https://example.com).\n\n- List item 1\n- List item 2\n\n```\nconst x = 42;\nconsole.log(x);\n```\n\n'
        .repeat(avgContentLen / 200);
    messages.push({ role: 'assistant', content: assistantContent });
  }
  return messages;
}

function estimateLines(text: string, cols = 80): number {
  if (!text) return 0;
  const lines = text.split('\n');
  let total = 0;
  for (const line of lines) {
    total += Math.max(1, Math.ceil(line.length / cols));
  }
  return total;
}

function parseBlocks(content: string): Array<unknown> {
  const blocks: Array<unknown> = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) i++;
      i++;
      blocks.push({ type: 'codeBlock' });
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1]!.length });
      i++;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('```') &&
      !lines[i]!.match(/^(#{1,3})\s/)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ type: 'paragraph', content: paraLines.join(' ') });
  }
  return blocks;
}

interface PerfResult {
  name: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSec: number;
}

function measure(name: string, fn: () => void, iterations = 1000): PerfResult {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;

  return {
    name,
    iterations,
    totalTimeMs: Math.round(totalMs * 100) / 100,
    avgTimeMs: Math.round((totalMs / iterations) * 1000) / 1000,
    opsPerSec: Math.round((iterations / totalMs) * 1000),
  };
}

function printResults(results: PerfResult[]) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  McAgent Performance Benchmarks');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(
    '│ ' +
      'Benchmark'.padEnd(40) +
      '│ ' +
      'Ops/sec'.padStart(10) +
      ' │ ' +
      'Avg (ms)'.padStart(10) +
      ' │'
  );
  console.log('│' + '─'.repeat(42) + '│' + '─'.repeat(12) + '│' + '─'.repeat(12) + '│');

  for (const r of results) {
    console.log(
      '│ ' +
        r.name.padEnd(40) +
        '│ ' +
        String(r.opsPerSec.toLocaleString()).padStart(10) +
        ' │ ' +
        r.avgTimeMs.toFixed(4).padStart(10) +
        ' │'
    );
  }
  console.log('');
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

const conversation = generateLongConversation(50, 500);

const results: PerfResult[] = [];

// 1. estimateLines — called per message, per render
results.push(
  measure('estimateLines (500 chars)', () => {
    estimateLines('Hello world '.repeat(50), 80);
  })
);

// 2. estimateLines — long content
results.push(
  measure('estimateLines (5000 chars)', () => {
    estimateLines('Hello world '.repeat(500), 80);
  })
);

// 3. Total lines loop (100-message simulation)
results.push(
  measure('TotalLines loop (100 msgs)', () => {
    const msgs = conversation.slice(0, 100);
    let total = 0;
    for (const msg of msgs) {
      total += 1 + estimateLines((msg.content as string) || '', 80) + 1;
    }
    void total;
  })
);

// 4. Double traversal (current behavior)
results.push(
  measure('Double-traverse (100 msgs)', () => {
    const msgs = conversation.slice(0, 100);
    // First pass
    let total = 0;
    for (const msg of msgs) {
      total += 1 + estimateLines((msg.content as string) || '', 80) + 1;
    }
    // Second pass (scroll offset)
    let accumulated = 0;
    for (const msg of msgs) {
      accumulated += 1 + estimateLines((msg.content as string) || '', 80) + 1;
    }
    void total;
    void accumulated;
  })
);

// 5. Single-traverse (optimized)
results.push(
  measure('Single-traverse (100 msgs)', () => {
    const msgs = conversation.slice(0, 100);
    // Precompute line heights
    const heights: number[] = [];
    let total = 0;
    for (const msg of msgs) {
      const h = 1 + estimateLines((msg.content as string) || '', 80) + 1;
      heights.push(h);
      total += h;
    }
    let accumulated = 0;
    for (const h of heights) {
      accumulated += h;
    }
    void total;
    void accumulated;
  })
);

// 6. Markdown parseBlocks
const mdContent =
  '# Heading\n\n**Bold** with `code`.\n\n- Item 1\n- Item 2\n\n```\ncode\n```\n\nParagraph. '.repeat(5);
results.push(
  measure('parseBlocks (md parsing)', () => {
    parseBlocks(mdContent);
  })
);

// 7. Token estimation
const longText = '测试中文 '.repeat(200) + 'hello world '.repeat(200);
results.push(
  measure('estimateTokens (1000 chars)', () => {
    estimateTokens(longText);
  })
);

// 8. Message eviction (small, under limit)
results.push(
  measure('evictMessages (under limit)', () => {
    const msgs = generateLongConversation(10, 100);
    evictMessages(msgs, 96_000);
  })
);

// 9. Message eviction (needs eviction)
results.push(
  measure('evictMessages (over limit)', () => {
    const msgs = generateLongConversation(100, 200);
    evictMessages(msgs, 1000);
  })
);

// 10. String split (hot path in estimateLines)
results.push(
  measure('String.split (5000 chars)', () => {
    'Hello world. '.repeat(500).split('\n');
  })
);

printResults(results);
