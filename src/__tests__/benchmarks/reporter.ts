/**
 * Benchmark reporter — generates console and JSON output from benchmark results.
 *
 * Supports:
 *   - Pretty-printed console output with ANSI coloring
 *   - JSON export for CI/CD pipelines
 *   - Markdown table generation
 *   - Summary aggregation across multiple suites
 */

import { writeFileSync } from 'node:fs';
import type { BenchmarkResult } from './framework.js';
import { formatMicroseconds, sanityCheck } from './framework.js';
import type { BaselineReport } from './baseline.js';
import { formatComparisonReport } from './baseline.js';

// ─── ANSI codes ─────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// ─── Ranking helpers ────────────────────────────────────────────────────────

interface RankedResult extends BenchmarkResult {
  rank: number;
  percentile: number;
}

function rankByMean(results: BenchmarkResult[]): RankedResult[] {
  const sorted = [...results].sort((a, b) => a.stats.meanUs - b.stats.meanUs);
  return sorted.map((r, i) => ({
    ...r,
    rank: i + 1,
    percentile: Math.round(((i + 1) / sorted.length) * 100),
  }));
}

// ─── Console report ─────────────────────────────────────────────────────────

export function printConsoleReport(results: BenchmarkResult[]): void {
  const ranked = rankByMean(results);

  console.log(`\n${C.bold}${C.cyan}${'═'.repeat(80)}${C.reset}`);
  console.log(`${C.bold}${C.white}  McAgent MICRO-BENCHMARK REPORT${C.reset}`);
  console.log(`${C.cyan}${'═'.repeat(80)}${C.reset}\n`);

  // Summary statistics
  const totalBenchmarks = results.length;
  const allMeans = results.map((r) => r.stats.meanUs);
  const overallMean = allMeans.reduce((a, b) => a + b, 0) / allMeans.length;
  const overallMin = Math.min(...allMeans);
  const overallMax = Math.max(...allMeans);
  const highVarCount = results.filter((r) => r.stats.cv > 0.3).length;

  console.log(`${C.bold}  Summary:${C.reset}`);
  console.log(`    Benchmarks:     ${totalBenchmarks}`);
  console.log(`    Overall mean:   ${formatMicroseconds(overallMean)}`);
  console.log(
    `    Range:          ${formatMicroseconds(overallMin)} — ${formatMicroseconds(overallMax)}`
  );
  console.log(`    High variance:  ${highVarCount} benchmarks (CV > 0.3)`);
  console.log();

  // Per-benchmark results
  console.log(`${C.bold}  Detailed Results (ranked by mean, fastest first):${C.reset}\n`);

  // Table header
  const hRank = '#'.padStart(3);
  const hName = 'Benchmark'.padEnd(42);
  const hMean = 'Mean'.padStart(10);
  const hMedian = 'Median'.padStart(10);
  const hP95 = 'P95'.padStart(10);
  const hCV = 'CV'.padStart(8);
  const hWarn = '';
  console.log(
    `${C.bold}  ${hRank}  ${hName} ${hMean} ${hMedian} ${hP95} ${hCV} ${hWarn}${C.reset}`
  );
  console.log(`  ${'─'.repeat(90)}`);

  for (const r of ranked) {
    const warnings = sanityCheck(r);
    const warnIcon = warnings.length > 0 ? ` ${C.yellow}⚠${C.reset}` : '';

    const rank = String(r.rank).padStart(3);
    const name = r.name.length > 40 ? r.name.slice(0, 37) + '...' : r.name.padEnd(40);
    const mean = formatMicroseconds(r.stats.meanUs).padStart(10);
    const median = formatMicroseconds(r.stats.medianUs).padStart(10);
    const p95 = formatMicroseconds(r.stats.p95Us).padStart(10);
    const cv = r.stats.cv.toFixed(2).padStart(8);

    const color = warnings.length > 0 ? C.yellow : C.reset;
    console.log(`${color}  ${rank}  ${name} ${mean} ${median} ${p95} ${cv} ${warnIcon}${C.reset}`);

    // Show warnings for high-variance benchmarks
    if (warnings.length > 0) {
      for (const w of warnings) {
        console.log(`${C.dim}         ↳ ${w}${C.reset}`);
      }
    }
  }

  console.log(`\n${C.cyan}${'═'.repeat(80)}${C.reset}\n`);

  // Legend
  console.log(
    `${C.dim}  ⚠ = High variance or outlier detected. Results may be unstable.${C.reset}`
  );
  console.log(
    `${C.dim}  CV = Coefficient of Variation (stddev/mean). <0.1 is excellent, >0.3 is noisy.${C.reset}\n`
  );
}

// ─── JSON export ────────────────────────────────────────────────────────────

export function exportJSON(results: BenchmarkResult[], filepath: string): void {
  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    benchmarkCount: results.length,
    results: results.map((r) => ({
      name: r.name,
      stats: {
        sampleCount: r.stats.sampleCount,
        meanUs: r.stats.meanUs,
        medianUs: r.stats.medianUs,
        minUs: r.stats.minUs,
        maxUs: r.stats.maxUs,
        p50Us: r.stats.p50Us,
        p75Us: r.stats.p75Us,
        p95Us: r.stats.p95Us,
        p99Us: r.stats.p99Us,
        stddevUs: r.stats.stddevUs,
        cv: r.stats.cv,
      },
      totalDurationMs: r.totalDurationMs,
      gcTriggered: r.gcTriggered,
    })),
  };

  writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
}

// ─── Markdown export ────────────────────────────────────────────────────────

export function exportMarkdown(results: BenchmarkResult[], filepath: string): void {
  const ranked = rankByMean(results);

  const lines: string[] = [
    '# McAgent Micro-Benchmark Report',
    '',
    `**Generated**: ${new Date().toISOString()}`,
    `**Node.js**: ${process.version}`,
    `**Platform**: ${process.platform} ${process.arch}`,
    `**Benchmarks**: ${results.length}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total benchmarks | ${results.length} |`,
    `| High variance (CV > 0.3) | ${results.filter((r) => r.stats.cv > 0.3).length} |`,
    '',
    '## Detailed Results',
    '',
    '| # | Benchmark | Mean | Median | P95 | P99 | CV |',
    '|---|-----------|------|--------|-----|-----|----|',
  ];

  for (const r of ranked) {
    const name = r.name.replace(/\|/g, '\\|');
    lines.push(
      `| ${r.rank} | ${name} | ${formatMicroseconds(r.stats.meanUs)} | ${formatMicroseconds(r.stats.medianUs)} | ${formatMicroseconds(r.stats.p95Us)} | ${formatMicroseconds(r.stats.p99Us)} | ${r.stats.cv.toFixed(3)} |`
    );
  }

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
}

// ─── Full report (baseline + results) ───────────────────────────────────────

export function printFullReport(results: BenchmarkResult[], baselineReport?: BaselineReport): void {
  printConsoleReport(results);

  if (baselineReport) {
    console.log(formatComparisonReport(baselineReport));
  }
}
