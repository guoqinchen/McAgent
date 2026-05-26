/**
 * Micro-benchmarks: ErrorRecoveryEngine.
 *
 * Measures:
 *   - Error classification throughput
 *   - Strategy determination latency
 *   - executeWithRecovery fast-path (no error) overhead
 *   - Recovery path (retry → fallback) latency
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runBenchmark, formatResult, sanityCheck } from './framework.js';
import { ErrorRecoveryEngine } from '../../engine/error-recovery-engine.js';

describe('Micro-benchmark: ErrorRecoveryEngine', () => {
  let engine: ErrorRecoveryEngine;

  beforeEach(() => {
    engine = new ErrorRecoveryEngine();
  });

  // Pre-built errors for classification benchmark
  const ENOTFOUND_ERR: NodeJS.ErrnoException = Object.assign(
    new Error('getaddrinfo ENOTFOUND api.example.com'),
    { code: 'ENOTFOUND' }
  );
  const ETIMEDOUT_ERR: NodeJS.ErrnoException = Object.assign(new Error('connect ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });
  const EACCES_ERR: NodeJS.ErrnoException = Object.assign(new Error('permission denied'), {
    code: 'EACCES',
  });
  const TYPE_ERR = Object.assign(new Error('invalid type'), { name: 'TypeError' });
  const RATE_LIMIT_ERR = new Error('429 Too Many Requests - rate limit exceeded');
  const VALIDATION_ERR = new Error('validation failed: field x is required');
  const GENERIC_ERR = new Error('something went wrong');

  const ERRORS = [
    ENOTFOUND_ERR,
    ETIMEDOUT_ERR,
    EACCES_ERR,
    TYPE_ERR,
    RATE_LIMIT_ERR,
    VALIDATION_ERR,
    GENERIC_ERR,
  ];

  it('classifyError — single call latency (mixed error types)', async () => {
    let idx = 0;
    const result = await runBenchmark({
      name: 'ErrorRecoveryEngine.classifyError — mixed types',
      fn: () => {
        (engine as any).classifyError(ERRORS[idx % ERRORS.length]);
        idx++;
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

  it('determineStrategy — single call latency', async () => {
    let i = 0;
    const errorTypes = [
      'network',
      'timeout',
      'api_error',
      'validation_error',
      'permission_error',
      'rate_limit',
      'unknown',
    ] as const;

    const result = await runBenchmark({
      name: 'ErrorRecoveryEngine.determineStrategy — single call',
      fn: () => {
        engine.determineStrategy({
          error: new Error('test'),
          errorType: errorTypes[i % errorTypes.length],
          retryCount: i % 4,
          maxRetries: 3,
          operation: 'test',
          timestamp: new Date(),
        });
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

  it('executeWithRecovery — fast path (no error)', async () => {
    const result = await runBenchmark({
      name: 'ErrorRecoveryEngine.executeWithRecovery — success path',
      fn: async () => {
        await engine.executeWithRecovery(async () => 'ok', 'test-op');
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

  it('executeWithRecovery — retry path (1 failure then success)', async () => {
    // Note: small sample count because each sample has a 1s retry delay
    const result = await runBenchmark({
      name: 'ErrorRecoveryEngine.executeWithRecovery — retry path',
      fn: async () => {
        let calls = 0;
        await engine.executeWithRecovery(async () => {
          if (calls++ === 0) throw new Error('temporary failure');
          return 'ok';
        }, 'test-op');
      },
      samples: 2,
      warmupSamples: 1,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  }, 10_000);

  it('executeWithRecovery — fallback path (all retries exhausted)', async () => {
    // Note: very small sample count — each sample has 3 retries
    // with exponential backoff (~7s per sample)
    const result = await runBenchmark({
      name: 'ErrorRecoveryEngine.executeWithRecovery — fallback path',
      fn: async () => {
        await engine.executeWithRecovery(async () => {
          throw new Error('persistent failure');
        }, 'fetch_data');
      },
      samples: 1,
      warmupSamples: 0,
    });
    console.log(formatResult(result));
    const warnings = sanityCheck(result);
    if (warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      warnings.forEach((w) => console.log('     ↳ ' + w));
    }
  }, 30_000);
});
