/**
 * UI Rendering Performance Benchmarks for McAgent.
 * Benchmarks key UI operations: ANSI generation, stripAnsi, wrapText, line estimation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { runBenchmark, formatResult } from './framework.js';
import {
  createAnsiTheme,
  AnsiBuilder,
  acquireBuilder,
  returnBuilder,
} from '../../ui/ansi-theme.js';
import { stripAnsi, wrapText, ansiPad } from '../../ui/headless-renderer.js';

let theme: ReturnType<typeof createAnsiTheme>;

beforeAll(() => {
  theme = createAnsiTheme('dark');
});

// ─── ANSI Performance ──────────────────────────────────────────

describe('ANSI/tty Output Performance', () => {
  it('AnsiBuilder — 10 colored segments', async () => {
    const result = await runBenchmark({
      name: 'AnsiBuilder — 10 colored segments',
      fn: () => {
        const b = new AnsiBuilder();
        b.append(theme.success, 'suc');
        b.append(theme.error, 'err');
        b.append(theme.warning, 'warn');
        b.append(theme.muted, 'info');
        b.append(theme.header, 'head');
        b.append(theme.toolCall, 'tool');
        b.append(theme.toolName, 'read');
        b.append(theme.toolRunning, 'run');
        b.append(theme.toolPending, 'pend');
        b.append(theme.toolSuccess, 'done');
        return b.build();
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(15);
  });

  it('AnsiBuilder (pooled) — 10 colored segments', async () => {
    const result = await runBenchmark({
      name: 'AnsiBuilder (pooled) — 10 colored segments',
      fn: () => {
        const b = acquireBuilder();
        b.append(theme.success, 'suc');
        b.append(theme.error, 'err');
        b.append(theme.warning, 'warn');
        b.append(theme.muted, 'info');
        b.append(theme.header, 'head');
        const r = b.build();
        returnBuilder(b);
        return r;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(15);
  });

  it('Traditional string concat — 10 segments', async () => {
    const result = await runBenchmark({
      name: 'Traditional string concat — 10 segments',
      fn: () =>
        `${theme.success}ok${theme.reset}${theme.error}err${theme.reset}${theme.warning}warn${theme.reset}${theme.muted}info${theme.reset}`,
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(5);
  });

  it('stripAnsi — 1KB mixed ANSI', async () => {
    let text = '';
    for (let i = 0; i < 20; i++) {
      text += `${theme.success}suc${theme.reset}${theme.error}err${theme.reset}`;
    }
    const result = await runBenchmark({
      name: 'stripAnsi — ~1KB',
      fn: () => stripAnsi(text),
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(10);
  });

  it('wrapText — 5KB with ANSI', async () => {
    let text = '';
    for (let i = 0; i < 100; i++) {
      text += `${theme.success}Line ${i} content${theme.reset} `;
    }
    const result = await runBenchmark({
      name: 'wrapText — ~5KB',
      fn: () => wrapText(text, 80),
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(500);
  });

  it('ansiPad — short text', async () => {
    const result = await runBenchmark({
      name: 'ansiPad — 20 chars',
      fn: () => ansiPad(`${theme.success}t${theme.reset}`, 20, 'left'),
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(5);
  });
});

// ─── Message List ────────────────────────────────────────────────

describe('Message List Rendering Performance', () => {
  it('estimateLines — 10KB text', async () => {
    const text = 'A'.repeat(10000);
    const result = await runBenchmark({
      name: 'estimateLines — 10KB',
      fn: () => {
        if (!text) return 0;
        const lines = text.split('\n');
        let total = 0;
        for (const l of lines) total += Math.max(1, Math.ceil(l.length / 80));
        return total;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(50);
  });

  it('estimateLines — 1000 lines (100KB)', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) lines.push('x'.repeat(80));
    const text = lines.join('\n');
    const result = await runBenchmark({
      name: 'estimateLines — 1000 lines',
      fn: () => {
        if (!text) return 0;
        const sl = text.split('\n');
        let total = 0;
        for (const l of sl) total += Math.max(1, Math.ceil(l.length / 80));
        return total;
      },
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(200);
  });

  it('visible messages — 100 msgs', async () => {
    const heights = [
      3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7,
      3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6,
      8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5, 7, 3, 4, 6, 8, 3, 5,
      7, 3, 4, 6, 8, 3, 4,
    ];
    const result = await runBenchmark({
      name: 'visibleMessages — 100 msgs',
      fn: () => {
        let acc = 0,
          idx = 0;
        for (let i = 0; i < heights.length; i++) {
          if (acc + heights[i]! <= 30) {
            acc += heights[i]!;
            idx = i + 1;
          } else break;
        }
        return idx;
      },
      samples: 100,
      warmupSamples: 10,
    });
    console.log(formatResult(result));
    expect(result.stats.meanUs).toBeLessThan(10);
  });
});

// ─── AnsiBuilder correctness ─────────────────────────────────────

describe('AnsiBuilder correctness', () => {
  const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g');
  it('merges adjacent same-color segments', () => {
    const b = new AnsiBuilder();
    b.append(theme.success, 'hello ');
    b.append(theme.success, 'world');
    const result = b.build();
    const codes = result.match(ANSI_RE) || [];
    expect(codes.length).toBe(2);
  });

  it('separate codes for different colors', () => {
    const b = new AnsiBuilder();
    b.append(theme.success, 'green');
    b.append(theme.error, 'red');
    const result = b.build();
    const codes = result.match(ANSI_RE) || [];
    expect(codes.length).toBe(3);
  });

  it('empty text produces empty output', () => {
    const b = new AnsiBuilder();
    b.append('', '');
    expect(b.build()).toBe('');
  });

  it('shorter than traditional concat for same-color runs', () => {
    const b = new AnsiBuilder();
    b.append(theme.success, 'hello');
    b.append(theme.success, ' world');
    const merged = b.build();
    const trad = `${theme.success}hello${theme.reset}${theme.success} world${theme.reset}`;
    expect(merged.length).toBeLessThan(trad.length);
    expect(stripAnsi(merged)).toBe(stripAnsi(trad));
  });

  it('pooled builder works', () => {
    const b = acquireBuilder();
    b.append(theme.success, 'pooled');
    const r = b.build();
    returnBuilder(b);
    expect(r).toContain('pooled');
    b.append(theme.error, 'reused');
    const r2 = b.build();
    expect(r2).toContain('reused');
  });
});
