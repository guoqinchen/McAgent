/**
 * Baseline storage and comparison for micro-benchmarks.
 *
 * Stores baseline results to disk as JSON and compares new runs
 * against stored baselines, flagging regressions over a configurable threshold.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BenchmarkResult } from './framework.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BaselineEntry {
  /** Benchmark name — must match exactly between runs. */
  name: string;
  /** Key statistical values stored for comparison. */
  stats: {
    meanUs: number;
    medianUs: number;
    p95Us: number;
    p99Us: number;
    stddevUs: number;
    minUs: number;
    maxUs: number;
  };
  /** ISO timestamp when the baseline was recorded. */
  recordedAt: string;
  /** Git commit hash at time of recording (if available). */
  commit?: string;
  /** Node.js version. */
  nodeVersion: string;
  /** OS platform. */
  platform: string;
}

export interface BaselineFile {
  version: 1;
  createdAt: string;
  entries: BaselineEntry[];
}

export interface ComparisonResult {
  name: string;
  /** Current value. */
  current: number;
  /** Baseline value. */
  baseline: number;
  /** Percentage change: positive = regression (slower), negative = improvement (faster). */
  percentChange: number;
  /** Was this a regression exceeding the threshold? */
  isRegression: boolean;
  /** Was this an improvement exceeding the threshold? */
  isImprovement: boolean;
}

export interface BaselineReport {
  comparisons: ComparisonResult[];
  regressionCount: number;
  improvementCount: number;
  stableCount: number;
  newCount: number;
  missingCount: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const BASELINE_DIR = join(process.cwd(), '.benchmark-baselines');
const REGRESSION_THRESHOLD_PERCENT = 10; // Flag if >10% slower
const IMPROVEMENT_THRESHOLD_PERCENT = 10; // Flag if >10% faster

// ─── Storage ────────────────────────────────────────────────────────────────

function ensureBaselineDir(): string {
  if (!existsSync(BASELINE_DIR)) {
    mkdirSync(BASELINE_DIR, { recursive: true });
  }
  return BASELINE_DIR;
}

function getBaselinePath(name: string): string {
  return join(ensureBaselineDir(), `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

/**
 * Save a set of benchmark results as a new baseline.
 */
export function saveBaseline(name: string, results: BenchmarkResult[], commit?: string): void {
  const entries: BaselineEntry[] = results.map((r) => ({
    name: r.name,
    stats: {
      meanUs: r.stats.meanUs,
      medianUs: r.stats.medianUs,
      p95Us: r.stats.p95Us,
      p99Us: r.stats.p99Us,
      stddevUs: r.stats.stddevUs,
      minUs: r.stats.minUs,
      maxUs: r.stats.maxUs,
    },
    recordedAt: new Date().toISOString(),
    commit,
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
  }));

  const file: BaselineFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries,
  };

  writeFileSync(getBaselinePath(name), JSON.stringify(file, null, 2), 'utf-8');
}

/**
 * Load a previously saved baseline.
 */
export function loadBaseline(name: string): BaselineFile | null {
  const path = getBaselinePath(name);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as BaselineFile;
  } catch {
    return null;
  }
}

/**
 * List all saved baseline names.
 */
export function listBaselines(): string[] {
  if (!existsSync(BASELINE_DIR)) return [];
  return readdirSync(BASELINE_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => f.replace('.json', ''));
}

// ─── Comparison ─────────────────────────────────────────────────────────────

/**
 * Compare current results against a stored baseline.
 *
 * Uses the mean as the primary comparison metric.
 * Returns a structured report with per-benchmark change percentages.
 */
export function compareWithBaseline(
  current: BenchmarkResult[],
  baseline: BaselineFile,
  thresholdPercent = REGRESSION_THRESHOLD_PERCENT
): BaselineReport {
  const baselineMap = new Map<string, BaselineEntry>();
  for (const entry of baseline.entries) {
    baselineMap.set(entry.name, entry);
  }

  const comparisons: ComparisonResult[] = [];
  let regressionCount = 0;
  let improvementCount = 0;
  let stableCount = 0;
  let newCount = 0;
  let missingCount = 0;

  for (const result of current) {
    const bl = baselineMap.get(result.name);

    if (!bl) {
      newCount++;
      comparisons.push({
        name: result.name,
        current: result.stats.meanUs,
        baseline: 0,
        percentChange: Infinity,
        isRegression: false,
        isImprovement: false,
      });
      continue;
    }

    const currentMean = result.stats.meanUs;
    const baselineMean = bl.stats.meanUs;

    if (baselineMean === 0) {
      stableCount++;
      comparisons.push({
        name: result.name,
        current: currentMean,
        baseline: baselineMean,
        percentChange: 0,
        isRegression: false,
        isImprovement: false,
      });
      continue;
    }

    const percentChange = ((currentMean - baselineMean) / baselineMean) * 100;
    const isRegression = percentChange > thresholdPercent;
    const isImprovement = percentChange < -thresholdPercent;

    if (isRegression) regressionCount++;
    else if (isImprovement) improvementCount++;
    else stableCount++;

    comparisons.push({
      name: result.name,
      current: currentMean,
      baseline: baselineMean,
      percentChange: Math.round(percentChange * 100) / 100,
      isRegression,
      isImprovement,
    });
  }

  // Check for baselines not present in current run
  for (const [name] of baselineMap) {
    if (!current.some((r) => r.name === name)) {
      missingCount++;
    }
  }

  return {
    comparisons,
    regressionCount,
    improvementCount,
    stableCount,
    newCount,
    missingCount,
  };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function formatComparisonReport(report: BaselineReport): string {
  const lines: string[] = [
    `\n${'═'.repeat(80)}`,
    `  BASELINE COMPARISON REPORT`,
    `${'─'.repeat(80)}`,
    `  Regressions:  ${report.regressionCount}  (>${REGRESSION_THRESHOLD_PERCENT}% slower)`,
    `  Improvements: ${report.improvementCount}  (>${IMPROVEMENT_THRESHOLD_PERCENT}% faster)`,
    `  Stable:       ${report.stableCount}`,
    `  New:          ${report.newCount}  (no baseline)`,
    `  Missing:      ${report.missingCount}  (in baseline, not run)`,
    `${'─'.repeat(80)}`,
  ];

  // Show regressions first
  const regressions = report.comparisons.filter((c) => c.isRegression);
  if (regressions.length > 0) {
    lines.push(`\n  ⚠️  REGRESSIONS:`);
    for (const c of regressions) {
      lines.push(`    🔴 ${c.name}`);
      lines.push(
        `       ${c.baseline.toFixed(2)} μs → ${c.current.toFixed(2)} μs  (+${c.percentChange.toFixed(1)}%)`
      );
    }
  }

  // Show improvements
  const improvements = report.comparisons.filter((c) => c.isImprovement);
  if (improvements.length > 0) {
    lines.push(`\n  ✅ IMPROVEMENTS:`);
    for (const c of improvements) {
      lines.push(`    🟢 ${c.name}`);
      lines.push(
        `       ${c.baseline.toFixed(2)} μs → ${c.current.toFixed(2)} μs  (${c.percentChange.toFixed(1)}%)`
      );
    }
  }

  // Show new benchmarks
  const newOnes = report.comparisons.filter((c) => c.percentChange === Infinity);
  if (newOnes.length > 0) {
    lines.push(`\n  🆕 NEW (no baseline):`);
    for (const c of newOnes) {
      lines.push(`    ${c.name}: ${c.current.toFixed(2)} μs`);
    }
  }

  // Summary table
  lines.push(`\n${'─'.repeat(80)}`);
  lines.push(`  DETAILED COMPARISON:`);
  lines.push(
    `  ${'Benchmark'.padEnd(50)} ${'Baseline'.padStart(10)} ${'Current'.padStart(10)} ${'Change'.padStart(10)}`
  );
  lines.push(`  ${'─'.repeat(80)}`);

  for (const c of report.comparisons) {
    const name = c.name.length > 48 ? c.name.slice(0, 45) + '...' : c.name.padEnd(48);
    const base = c.baseline === 0 ? 'N/A' : `${c.baseline.toFixed(1)} μs`;
    const curr = `${c.current.toFixed(1)} μs`;
    const change =
      c.percentChange === Infinity
        ? 'NEW'
        : `${c.percentChange > 0 ? '+' : ''}${c.percentChange.toFixed(1)}%`;
    lines.push(`  ${name} ${base.padStart(10)} ${curr.padStart(10)} ${change.padStart(10)}`);
  }

  lines.push(`${'═'.repeat(80)}\n`);
  return lines.join('\n');
}

export { REGRESSION_THRESHOLD_PERCENT, IMPROVEMENT_THRESHOLD_PERCENT };
