/**
 * Micro-benchmarks: MetricsCollector.
 *
 * Measures throughput of the metrics collection pipeline:
 *   - startRequest / endRequest throughput
 *   - getSummary performance with large datasets
 *   - reset latency
 *   - recordToolCall throughput
 *   - Active request tracking overhead
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { MetricsCollector } from '../../monitoring/metrics-collector.js';

describe('Micro-benchmark: MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('startRequest + endRequest — single pair latency', async () => {
    let id = 0;
    const result = await runBenchmark({
      name: 'MetricsCollector — start+end single pair',
      fn: () => {
        const rid = `req_${id++}`;
        collector.startRequest(rid);
        collector.endRequest(rid, true);
      },
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

  it('getSummary — after 1000 requests', async () => {
    for (let i = 0; i < 1000; i++) {
      collector.startRequest(`req_${i}`);
      collector.endRequest(`req_${i}`, i % 10 !== 0);
    }

    const result = await runBenchmark({
      name: 'MetricsCollector.getSummary — after 1K requests',
      fn: () => collector.getSummary(),
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

  it('getMetrics — defensive copy overhead', async () => {
    for (let i = 0; i < 100; i++) {
      collector.startRequest(`req_${i}`);
      collector.endRequest(`req_${i}`, true);
    }

    const result = await runBenchmark({
      name: 'MetricsCollector.getMetrics — defensive copy',
      fn: () => collector.getMetrics(),
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

  it('reset — single call latency', async () => {
    for (let i = 0; i < 100; i++) {
      collector.startRequest(`req_${i}`);
      collector.endRequest(`req_${i}`, true);
    }

    const result = await runBenchmark({
      name: 'MetricsCollector.reset — after 100 requests',
      fn: () => {
        collector.reset();
        // Re-populate
        for (let i = 0; i < 100; i++) {
          collector.startRequest(`req_${i}`);
          collector.endRequest(`req_${i}`, true);
        }
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

  it('recordToolCall — single call latency', async () => {
    let i = 0;
    const result = await runBenchmark({
      name: 'MetricsCollector.recordToolCall — single call',
      fn: () => {
        collector.recordToolCall(i % 10, i % 5 !== 0, `tool_${i % 10}`);
        i++;
      },
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

  it('getActiveRequestCount — single call latency', async () => {
    for (let i = 0; i < 10; i++) {
      collector.startRequest(`req_${i}`);
    }

    const result = await runBenchmark({
      name: 'MetricsCollector.getActiveRequestCount — single call',
      fn: () => collector.getActiveRequestCount(),
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
});
