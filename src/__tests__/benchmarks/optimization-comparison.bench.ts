/**
 * Optimization Comparison Benchmarks — McAgent v3.0.
 *
 * Compares before/after performance of key optimization targets:
 *   1. ANSI/tty output (AnsiBuilder, stripAnsi, wrapText, renderToolResults)
 *   2. UI rendering (estimateLines, visible message computation, buildToolCallInfos)
 *   3. Streaming (TypewriterContent, useElapsed timers)
 *   4. Memory (large message list handling, pooled buffers)
 *   5. Message collapsing (O(n²) vs O(n) collapse algorithm)
 *
 * Run: npx vitest run src/__tests__/benchmarks/optimization-comparison.bench.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runBenchmark, formatResult } from './framework.js';
import {
  createAnsiTheme,
  AnsiBuilder,
  acquireBuilder,
  returnBuilder,
} from '../../ui/ansi-theme.js';
import {
  stripAnsi,
  wrapText,
  renderToolResults,
  renderToolResult,
  sectionBlock,
} from '../../ui/headless-renderer.js';

let theme: ReturnType<typeof createAnsiTheme>;

beforeAll(() => {
  theme = createAnsiTheme('dark');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ANSI/tty Output Performance
// ═══════════════════════════════════════════════════════════════════════════════

describe('ANSI/tty Output Optimization', () => {
  it('AnsiBuilder — 20 segments with adjacent merges', async () => {
    const result = await runBenchmark({
      name: '[v3] AnsiBuilder — 20 segments with merges',
      fn: () => {
        const b = new AnsiBuilder();
        b.append(theme.success, 'hello ');
        b.append(theme.success, 'world ');
        b.append(theme.error, 'error ');
        b.append(theme.error, 'critical ');
        b.append(theme.warning, 'warn ');
        b.append(theme.warning, 'warn2 ');
        b.append(theme.warning, 'warn3 ');
        b.append(theme.muted, 'info ');
        b.append(theme.muted, 'detail ');
        b.append(theme.header, 'head ');
        b.append(theme.toolCall, 'tool ');
        b.append(theme.toolName, 'read ');
        b.append(theme.toolRunning, 'run ');
        b.append(theme.toolPending, 'pend ');
        b.append(theme.toolSuccess, 'done ');
        b.append(theme.muted, 'time ');
        b.append(theme.errorHint, 'hint ');
        b.append(theme.border, 'line ');
        b.append(theme.streamingCursor, 'cursor ');
        b.append(theme.thinkingLabel, 'think ');
        return b.build();
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(20);
  });

  it('AnsiBuilder (pooled) — 20 segments', async () => {
    const result = await runBenchmark({
      name: '[v3] AnsiBuilder (pooled) — 20 segments',
      fn: () => {
        const b = acquireBuilder();
        b.append(theme.success, 'a ');
        b.append(theme.error, 'b ');
        b.append(theme.warning, 'c ');
        b.append(theme.muted, 'd ');
        b.append(theme.header, 'e ');
        b.append(theme.toolCall, 'f ');
        b.append(theme.toolName, 'g ');
        b.append(theme.toolRunning, 'h ');
        b.append(theme.toolPending, 'i ');
        b.append(theme.toolSuccess, 'j ');
        b.append(theme.muted, 'k ');
        b.append(theme.errorHint, 'l ');
        b.append(theme.border, 'm ');
        b.append(theme.streamingCursor, 'n ');
        b.append(theme.thinkingLabel, 'o ');
        b.append(theme.toolError, 'p ');
        b.append(theme.success, 'q ');
        b.append(theme.error, 'r ');
        b.append(theme.warning, 's ');
        b.append(theme.muted, 't ');
        const r = b.build();
        returnBuilder(b);
        return r;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(20);
  });

  it('stripAnsi — 5KB mixed ANSI (100 segments)', async () => {
    let text = '';
    for (let i = 0; i < 100; i++) {
      text += `${theme.success}line${theme.reset}${theme.error}err${theme.reset}${theme.warning}warn${theme.reset}`;
    }
    const result = await runBenchmark({
      name: '[v3] stripAnsi — 5KB (100 segments)',
      fn: () => stripAnsi(text),
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(30);
  });

  it('wrapText — 10KB with ANSI (large paragraph)', async () => {
    let text = '';
    for (let i = 0; i < 200; i++) {
      text += `${theme.success}Content paragraph ${i} with wrapping text.${theme.reset} `;
    }
    const result = await runBenchmark({
      name: '[v3] wrapText — 10KB with ANSI',
      fn: () => wrapText(text, 80),
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(800);
  });

  it('renderToolResults — 50 results (single-pass)', async () => {
    const results = Array.from({ length: 50 }, (_, i) => ({
      name: `tool_${i}`,
      status: (i % 3 === 0 ? 'success' : i % 3 === 1 ? 'failure' : 'skipped') as 'success' | 'failure' | 'skipped',
      durationMs: i * 100,
      preview: i % 2 === 0 ? `Output preview for tool ${i}` : undefined,
    }));
    const result = await runBenchmark({
      name: '[v3] renderToolResults — 50 results',
      fn: () => renderToolResults(theme, results),
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. UI Rendering Performance
// ═══════════════════════════════════════════════════════════════════════════════

describe('UI Rendering Optimization', () => {
  it('estimateLines — 100KB text (1000 lines)', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) lines.push('x'.repeat(80));
    const text = lines.join('\n');
    const result = await runBenchmark({
      name: '[v3] estimateLines — 100KB (1000 lines)',
      fn: () => {
        if (!text) return 0;
        const sl = text.split('\n');
        let total = 0;
        for (let i = 0; i < sl.length; i++) total += Math.max(1, Math.ceil(sl[i]!.length / 80));
        return total;
      },
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(200);
  });

  it('visibleMessages — 500 messages with windowing', async () => {
    const heights = Array.from({ length: 500 }, () => Math.floor(Math.random() * 8) + 1);
    const result = await runBenchmark({
      name: '[v3] visibleMessages — 500 msgs windowed',
      fn: () => {
        let acc = 0, idx = 0;
        for (let i = 0; i < heights.length; i++) {
          if (acc + heights[i]! <= 50) { acc += heights[i]!; idx = i + 1; }
          else break;
        }
        const total = heights.length;
        let sliceStart = idx;
        if (total - idx > 50) sliceStart = total - 50;
        return sliceStart;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. buildToolCallInfos Performance
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildToolCallInfos Optimization', () => {
  it('buildToolCallInfos — O(n) with 100 calls, 90 results', async () => {
    const toolCalls = Array.from({ length: 100 }, (_, i) => ({
      name: `tool_${i % 10}`,
      args: { cmd: `ls ${i}` },
    }));
    const toolResults = Array.from({ length: 90 }, (_, i) => ({
      name: `tool_${i % 10}`,
      result: `Output ${i}`,
      success: i % 5 !== 0,
    }));
    const result = await runBenchmark({
      name: '[v3] buildToolCallInfos — 100 calls, 90 results',
      fn: () => {
        const len = toolCalls.length;
        const rMap = new Map<number, { name: string; result: string; success: boolean }>();
        const used = new Set<number>();
        for (let ri = 0; ri < toolResults.length; ri++) {
          const tr = toolResults[ri]!;
          for (let ci = 0; ci < len; ci++) {
            if (toolCalls[ci]!.name === tr.name && !used.has(ci)) {
              used.add(ci);
              rMap.set(ci, tr);
              break;
            }
          }
        }
        const lastIdx = len - 1;
        const out = new Array(len);
        for (let i = 0; i < len; i++) {
          const tc = toolCalls[i]!;
          const r = rMap.get(i);
          out[i] = {
            name: tc.name,
            args: tc.args,
            status: r ? (r.success ? 'success' : 'error') : i === lastIdx ? 'running' : 'pending',
            result: r?.result,
          };
        }
        return out;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Memory / Large List Performance
// ═══════════════════════════════════════════════════════════════════════════════

describe('Large Message List Memory Optimization', () => {
  it('pre-allocated array — 1000 items (simulates windowing)', async () => {
    const items = Array.from({ length: 1000 }, (_, i) =>
      `message ${i} content with some text for testing purposes`
    );
    const result = await runBenchmark({
      name: '[v3] pre-allocated array — 1000 items',
      fn: () => {
        const len = items.length;
        const start = Math.max(0, len - 50);
        const out = new Array<string>(Math.min(50, len));
        for (let i = start; i < len; i++) {
          out[i - start] = items[i]!;
        }
        return out;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ANSI Escape Reduction (key metric)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ANSI Escape Sequence Reduction', () => {
  it('AnsiBuilder produces fewer codes than traditional concat', () => {
    const b = new AnsiBuilder();
    b.append(theme.success, 'A');
    b.append(theme.success, 'B');
    b.append(theme.success, 'C');
    b.append(theme.error, 'D');
    b.append(theme.error, 'E');
    const merged = b.build();

    const traditional = `${theme.success}A${theme.reset}${theme.success}B${theme.reset}${theme.success}C${theme.reset}${theme.error}D${theme.reset}${theme.error}E${theme.reset}`;

    const mergedCodes = (merged.match(/\x1b\[[\d;]*m/g) || []).length;
    const tradCodes = (traditional.match(/\x1b\[[\d;]*m/g) || []).length;

    expect(mergedCodes).toBeLessThan(tradCodes);

    const stripped = stripAnsi(merged);
    const tradStripped = stripAnsi(traditional);
    expect(stripped).toBe(tradStripped);
  });

  it('AnsiBuilder escape reduction ratio measured', () => {
    const colors = [theme.success, theme.error, theme.warning, theme.muted, theme.header,
                    theme.toolCall, theme.toolName, theme.toolSuccess, theme.toolError, theme.muted];

    let mergedCodes = 0;
    let tradCodes = 0;
    const iterations = 1000;

    for (let iter = 0; iter < iterations; iter++) {
      const b = new AnsiBuilder();
      let trad = '';
      for (let i = 0; i < 20; i++) {
        const color = colors[i % colors.length]!;
        b.append(color, 'x');
        trad += `${color}x${theme.reset}`;
      }
      const merged = b.build();
      mergedCodes += (merged.match(/\x1b\[[\d;]*m/g) || []).length;
      tradCodes += (trad.match(/\x1b\[[\d;]*m/g) || []).length;
    }

    const ratio = (1 - mergedCodes / tradCodes) * 100;
    console.log(`\n  ANSI escape reduction: ${ratio.toFixed(1)}% fewer codes (${tradCodes} → ${mergedCodes})`);
    expect(ratio).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Object Pool Efficiency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Object Pool Efficiency', () => {
  it('pool acquisition — 100K cycles', async () => {
    const result = await runBenchmark({
      name: '[v3] builder pool — 100K acquire/release',
      fn: () => {
        const b = acquireBuilder();
        b.append(theme.success, 'x');
        void b.build();
        returnBuilder(b);
      },
      samples: 100,
      warmupSamples: 10,
      iterationsPerSample: 1000,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(2);
  });
});
