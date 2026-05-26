/**
 * Micro-benchmarking framework for McAgent.
 *
 * Provides:
 *   - Statistical aggregation (mean, median, p50, p75, p95, p99, stddev)
 *   - Warmup phase elimination
 *   - Optional GC triggering between samples
 *   - Configurable iteration counts and sample sizes
 *
 * Usage:
 *   const result = await runBenchmark({
 *     name: 'token estimation — 10KB ASCII',
 *     fn: () => estimateTokens(largeAsciiText),
 *     samples: 50,
 *     warmupSamples: 5,
 *   });
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BenchmarkConfig {
  /** Human-readable name for this benchmark. */
  name: string;
  /** The function to benchmark. */
  fn: () => void | Promise<void>;
  /** Number of timed samples to collect. Default: 50. */
  samples?: number;
  /** Number of warmup iterations (not timed). Default: 5. */
  warmupSamples?: number;
  /** Iterations per sample (fn called this many times per sample). Default: 1. */
  iterationsPerSample?: number;
  /** Whether to attempt GC between samples. Default: true. */
  triggerGC?: boolean;
}

export interface BenchmarkSample {
  /** Sample index (0-based). */
  index: number;
  /** Total duration in milliseconds for this sample's iterations. */
  durationMs: number;
  /** Per-iteration average for this sample (μs). */
  avgMicroseconds: number;
}

export interface BenchmarkStatistics {
  /** Number of timed samples collected. */
  sampleCount: number;
  /** Total iterations across all samples. */
  totalIterations: number;
  /** Arithmetic mean in microseconds per iteration. */
  meanUs: number;
  /** Median in microseconds per iteration. */
  medianUs: number;
  /** Minimum sample in microseconds per iteration. */
  minUs: number;
  /** Maximum sample in microseconds per iteration. */
  maxUs: number;
  /** 50th percentile (same as median). */
  p50Us: number;
  /** 75th percentile. */
  p75Us: number;
  /** 95th percentile. */
  p95Us: number;
  /** 99th percentile. */
  p99Us: number;
  /** Standard deviation in microseconds. */
  stddevUs: number;
  /** Coefficient of variation (stddev/mean) — lower is more stable. */
  cv: number;
  /** Raw samples for further analysis. */
  samples: BenchmarkSample[];
}

export interface BenchmarkResult {
  /** Config name. */
  name: string;
  /** Statistics for this run. */
  stats: BenchmarkStatistics;
  /** Wall-clock duration of the entire benchmark (ms). */
  totalDurationMs: number;
  /** Whether GC was triggered between samples. */
  gcTriggered: boolean;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeStatistics(samples: BenchmarkSample[]): BenchmarkStatistics {
  const perIterationUs = samples.map((s) => s.avgMicroseconds);
  const avg = mean(perIterationUs);

  return {
    sampleCount: samples.length,
    totalIterations: samples.reduce((sum, s) => sum + (s.avgMicroseconds > 0 ? 1 : 0), 0) * 1, // each sample represents iterationsPerSample iterations
    meanUs: round(avg),
    medianUs: round(median(perIterationUs)),
    minUs: round(Math.min(...perIterationUs)),
    maxUs: round(Math.max(...perIterationUs)),
    p50Us: round(percentile(perIterationUs, 50)),
    p75Us: round(percentile(perIterationUs, 75)),
    p95Us: round(percentile(perIterationUs, 95)),
    p99Us: round(percentile(perIterationUs, 99)),
    stddevUs: round(stddev(perIterationUs, avg)),
    cv: avg > 0 ? round(stddev(perIterationUs, avg) / avg) : 0,
    samples,
  };
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// ─── GC trigger ─────────────────────────────────────────────────────────────

function tryTriggerGC(): void {
  if (typeof globalThis.gc === 'function') {
    try {
      globalThis.gc();
    } catch {
      // GC not available
    }
  }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  const {
    name,
    fn,
    samples = 50,
    warmupSamples = 5,
    iterationsPerSample = 1,
    triggerGC = true,
  } = config;

  const totalStart = performance.now();

  // ── Warmup ──────────────────────────────────────────────────────────────
  for (let w = 0; w < warmupSamples; w++) {
    for (let i = 0; i < iterationsPerSample; i++) {
      await fn();
    }
    if (triggerGC) tryTriggerGC();
  }

  // ── Timed samples ───────────────────────────────────────────────────────
  const timedSamples: BenchmarkSample[] = [];

  for (let s = 0; s < samples; s++) {
    if (triggerGC) tryTriggerGC();

    const sampleStart = performance.now();
    for (let i = 0; i < iterationsPerSample; i++) {
      await fn();
    }
    const sampleDuration = performance.now() - sampleStart;

    timedSamples.push({
      index: s,
      durationMs: round(sampleDuration),
      avgMicroseconds: round((sampleDuration / iterationsPerSample) * 1000),
    });
  }

  const totalDuration = performance.now() - totalStart;
  const stats = computeStatistics(timedSamples);

  return {
    name,
    stats,
    totalDurationMs: round(totalDuration),
    gcTriggered: triggerGC && typeof globalThis.gc === 'function',
  };
}

/**
 * Run a synchronous benchmark (no async overhead needed).
 * This is a convenience wrapper for pure sync functions.
 */
export async function runSyncBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
  return runBenchmark(config);
}

/**
 * Run multiple benchmarks sequentially and collect all results.
 */
export async function runBenchmarkSuite(benchmarks: BenchmarkConfig[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (const bench of benchmarks) {
    const result = await runBenchmark(bench);
    results.push(result);
  }
  return results;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatMicroseconds(us: number): string {
  if (us >= 1_000_000) {
    return `${(us / 1_000_000).toFixed(2)} s`;
  }
  if (us >= 1_000) {
    return `${(us / 1_000).toFixed(2)} ms`;
  }
  if (us >= 1) {
    return `${us.toFixed(2)} μs`;
  }
  return `${(us * 1000).toFixed(2)} ns`;
}

export function formatResult(result: BenchmarkResult): string {
  const { stats } = result;
  const lines: string[] = [
    `\n${'═'.repeat(70)}`,
    `  ${result.name}`,
    `${'─'.repeat(70)}`,
    `  Samples:       ${stats.sampleCount}`,
    `  Mean:          ${formatMicroseconds(stats.meanUs)}`,
    `  Median:        ${formatMicroseconds(stats.medianUs)}`,
    `  Min:           ${formatMicroseconds(stats.minUs)}`,
    `  Max:           ${formatMicroseconds(stats.maxUs)}`,
    `  P50:           ${formatMicroseconds(stats.p50Us)}`,
    `  P75:           ${formatMicroseconds(stats.p75Us)}`,
    `  P95:           ${formatMicroseconds(stats.p95Us)}`,
    `  P99:           ${formatMicroseconds(stats.p99Us)}`,
    `  StdDev:        ${formatMicroseconds(stats.stddevUs)}`,
    `  CV:            ${stats.cv.toFixed(4)}`,
    `  Total time:    ${result.totalDurationMs.toFixed(0)} ms`,
    `  GC triggered:  ${result.gcTriggered}`,
    `${'═'.repeat(70)}`,
  ];
  return lines.join('\n');
}

/**
 * Quick sanity check: is the benchmark statistically meaningful?
 * Warns if CV > 0.3 (high variance) or if samples too few.
 */
export function sanityCheck(result: BenchmarkResult): string[] {
  const warnings: string[] = [];
  const { stats } = result;

  if (stats.sampleCount < 30) {
    warnings.push(
      `Low sample count (${stats.sampleCount}): consider ≥30 for statistical significance.`
    );
  }
  if (stats.cv > 0.3) {
    warnings.push(
      `High variance (CV=${stats.cv.toFixed(4)}): results may be unstable. Try more samples or isolate environment.`
    );
  }
  if (stats.maxUs > stats.medianUs * 10) {
    warnings.push(
      `Outlier detected: max (${formatMicroseconds(stats.maxUs)}) is >10x median (${formatMicroseconds(stats.medianUs)}).`
    );
  }

  return warnings;
}
