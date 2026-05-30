import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorRecoveryEngine } from '../engine/error-recovery-engine.js';

function makeNetworkError(): Error & { code?: string } {
  const err = new Error('connect ETIMEDOUT') as Error & { code?: string };
  err.code = 'ETIMEDOUT';
  return err;
}

function makeRateLimitError(): Error {
  return new Error('429 Too Many Requests - rate_limit_exceeded');
}

function makeValidationError(): Error {
  const err = new Error('validation failed: missing field');
  err.name = 'ValidationError';
  return err;
}

function makePermissionError(): Error & { code?: string } {
  const err = new Error('EACCES: permission denied') as Error & { code?: string };
  err.code = 'EACCES';
  return err;
}

describe('ErrorRecoveryEngine (behavioral)', () => {
  let engine: ErrorRecoveryEngine;

  beforeEach(() => {
    engine = new ErrorRecoveryEngine({ maxRetries: 3, baseRetryDelay: 10 });
  });

  it('returns result on first success (no retry)', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await engine.executeWithRecovery(fn, 'test.op');

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on network error and succeeds on retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeNetworkError()).mockResolvedValue('recovered');

    const result = await engine.executeWithRecovery(fn, 'test.op');

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on ETIMEDOUT and falls back to null', { timeout: 1000 }, async () => {
    const fn = vi.fn().mockRejectedValue(makeNetworkError());

    const result = await engine.executeWithRecovery(fn, 'test.op');

    // Fallback for unknown operations returns null
    expect(result).toBeNull();
    // maxRetries=3 means 4 total attempts
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('aborts immediately on ValidationError (no retry)', { timeout: 1000 }, async () => {
    const fn = vi.fn().mockRejectedValue(makeValidationError());

    await expect(engine.executeWithRecovery(fn, 'test.op')).rejects.toThrow('validation');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('escalates on EACCES permission error by throwing', { timeout: 1000 }, async () => {
    const fn = vi.fn().mockRejectedValue(makePermissionError());

    await expect(engine.executeWithRecovery(fn, 'test.op')).rejects.toThrow('EACCES');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit errors', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeRateLimitError()).mockResolvedValue('ok');

    const result = await engine.executeWithRecovery(fn, 'test.op');

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exponential backoff delays increase with retry count', { timeout: 2000 }, async () => {
    const engineWithLongDelay = new ErrorRecoveryEngine({
      maxRetries: 2,
      baseRetryDelay: 100,
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeNetworkError())
      .mockRejectedValueOnce(makeNetworkError())
      .mockResolvedValue('late');

    const start = Date.now();
    const result = await engineWithLongDelay.executeWithRecovery(fn, 'test.op');
    const elapsed = Date.now() - start;

    expect(result).toBe('late');
    // Should have waited at least ~300ms (100 + 200)
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });

  it('skips retry when maxRetries is 0 and error persists', async () => {
    const engineZeroRetry = new ErrorRecoveryEngine({
      maxRetries: 0,
      baseRetryDelay: 10,
    });

    const fn = vi.fn().mockRejectedValue(makeNetworkError());

    const result = await engineZeroRetry.executeWithRecovery(fn, 'test.op');

    // Fallback for test.op returns null
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
