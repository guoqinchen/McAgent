/**
 * Micro-benchmarks: StructuredLogger.
 *
 * Measures:
 *   - Log dispatch throughput (different levels)
 *   - ConsoleHandler formatting + write overhead
 *   - Below-level filter discard speed
 *   - Handler add/remove efficiency
 *   - Error-level log with stack trace overhead
 */

import { describe, it, beforeEach } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { StructuredLogger, ConsoleHandler } from '../../logging/structured-logger.js';

describe('Micro-benchmark: StructuredLogger', () => {
  let logger: StructuredLogger;

  beforeEach(() => {
    logger = new StructuredLogger('info');
  });

  it('info() — dispatch with no handlers (raw overhead)', async () => {
    let i = 0;
    const result = await runBenchmark({
      name: 'StructuredLogger.info — no handlers',
      fn: () => {
        logger.info('test message', { index: i++ });
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

  it('debug() — below level discard (no-op path)', async () => {
    let i = 0;
    const result = await runBenchmark({
      name: 'StructuredLogger.debug — below level (discard)',
      fn: () => {
        logger.debug('should be discarded', { index: i++ });
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

  it('error() — with Error object + context', async () => {
    const err = new Error('test error');
    let i = 0;
    const result = await runBenchmark({
      name: 'StructuredLogger.error — with Error object',
      fn: () => {
        logger.error('error occurred', err, { code: i++ });
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

  it('info() — dispatch with 1 ConsoleHandler', async () => {
    const handler = new ConsoleHandler('debug');
    logger.addHandler(handler);
    let i = 0;

    const result = await runBenchmark({
      name: 'StructuredLogger.info — with ConsoleHandler',
      fn: () => {
        logger.info('test', { index: i++ });
      },
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    const _warnings = sanityCheck(result);
    // ConsoleHandler writes to stdout — may have variance, so don't fail on warnings
  });

  it('ConsoleHandler.handle — single call (info level)', async () => {
    const handler = new ConsoleHandler('debug');
    let i = 0;

    const result = await runBenchmark({
      name: 'ConsoleHandler.handle — info level',
      fn: () => {
        handler.handle({
          timestamp: new Date(),
          level: 'info',
          message: `message ${i++}`,
          context: { index: i },
        });
      },
      samples: 50,
      warmupSamples: 5,
    });
    console.log(formatResult(result));
    const _warnings = sanityCheck(result);
    // stdout writes may cause variance
  });

  it('ConsoleHandler.handle — below level discard', async () => {
    const handler = new ConsoleHandler('error'); // only error and fatal pass
    let i = 0;

    const result = await runBenchmark({
      name: 'ConsoleHandler.handle — below level discard',
      fn: () => {
        handler.handle({
          timestamp: new Date(),
          level: 'info',
          message: `message ${i++}`,
        });
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

  it('addHandler + removeHandler — pair latency', async () => {
    const handler = new ConsoleHandler('debug');

    const result = await runBenchmark({
      name: 'StructuredLogger — add+remove handler pair',
      fn: () => {
        logger.addHandler(handler);
        logger.removeHandler(handler);
      },
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
