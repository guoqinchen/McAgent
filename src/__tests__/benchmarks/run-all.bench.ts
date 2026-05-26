/**
 * Master benchmark runner — orchestrates all micro-benchmarks.
 *
 * Usage:
 *   npx vitest run src/__tests__/benchmarks/run-all.bench.ts
 *
 * This file:
 *   1. Imports and runs all benchmark suites
 *   2. Collects results
 *   3. Saves baseline (first run) or compares with stored baseline
 *   4. Prints console report with ANSI coloring
 *   5. Exports JSON and Markdown reports
 */

import { describe, it, expect } from 'vitest';
import { runBenchmark, BenchmarkResult, sanityCheck } from './framework.js';
import { saveBaseline, loadBaseline, compareWithBaseline } from './baseline.js';
import { printFullReport, exportJSON, exportMarkdown } from './reporter.js';

// Re-export all individual benchmark suites to ensure they run
// when this file is executed as part of the test suite.
// Vitest discovers them via the describe/it blocks in each file.

// Import all benchmark files to register their tests
import './token-estimation.bench.js';
import './context-eviction.bench.js';
import './conversation-history.bench.js';
import './error-recovery.bench.js';
import './metrics-collector.bench.js';
import './structured-logger.bench.js';
import './tool-executor.bench.js';

// ─── Baseline management test ───────────────────────────────────────────────

describe('Micro-benchmark: Baseline & Report', () => {
  it('framework: runBenchmark with baseline save/load/compare round-trip', async () => {
    // Run a simple benchmark
    const results: BenchmarkResult[] = [];

    const r1 = await runBenchmark({
      name: 'baseline-test — fast operation',
      fn: () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += i;
      },
      samples: 30,
      warmupSamples: 5,
      iterationsPerSample: 100,
    });
    results.push(r1);

    const r2 = await runBenchmark({
      name: 'baseline-test — slow operation',
      fn: () => {
        const arr = Array.from({ length: 100 }, (_, i) => i);
        arr.sort(() => Math.random() - 0.5);
      },
      samples: 30,
      warmupSamples: 5,
      iterationsPerSample: 100,
    });
    results.push(r2);

    // Save as baseline
    saveBaseline('roundtrip-test', results);

    // Load it back
    const loaded = loadBaseline('roundtrip-test');
    expect(loaded).not.toBeNull();
    expect(loaded!.entries).toHaveLength(2);
    expect(loaded!.entries[0].name).toBe('baseline-test — fast operation');

    // Compare current results with baseline (should be all stable — same run)
    const comparison = compareWithBaseline(results, loaded!);
    expect(comparison.regressionCount).toBe(0);
    expect(comparison.stableCount).toBe(2);

    // Test JSON export
    exportJSON(results, '.benchmark-baselines/roundtrip-test-output.json');

    // Test Markdown export
    exportMarkdown(results, '.benchmark-baselines/roundtrip-test-output.md');

    // Print full report
    printFullReport(results, comparison);
  });

  it('framework: sanityCheck detects high variance', () => {
    const highVarResult: BenchmarkResult = {
      name: 'test — high variance',
      stats: {
        sampleCount: 5,
        totalIterations: 5,
        meanUs: 100,
        medianUs: 100,
        minUs: 10,
        maxUs: 2000,
        p50Us: 100,
        p75Us: 300,
        p95Us: 1500,
        p99Us: 1900,
        stddevUs: 500,
        cv: 0.5,
        samples: [],
      },
      totalDurationMs: 100,
      gcTriggered: false,
    };

    const warnings = sanityCheck(highVarResult);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('variance'))).toBe(true);
    expect(warnings.some((w) => w.includes('Outlier'))).toBe(true);
  });

  it('framework: sanityCheck passes clean results', () => {
    const cleanResult: BenchmarkResult = {
      name: 'test — clean',
      stats: {
        sampleCount: 50,
        totalIterations: 50,
        meanUs: 100,
        medianUs: 100,
        minUs: 90,
        maxUs: 110,
        p50Us: 100,
        p75Us: 105,
        p95Us: 108,
        p99Us: 110,
        stddevUs: 5,
        cv: 0.05,
        samples: [],
      },
      totalDurationMs: 100,
      gcTriggered: false,
    };

    const warnings = sanityCheck(cleanResult);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  });
});
