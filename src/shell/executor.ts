/**
 * Shell execution abstraction for McAgent.
 *
 * Provides a unified interface for running shell commands,
 * with a real implementation and a mock implementation for testing.
 */

import { execSync } from 'node:child_process';

// ─── Error type ────────────────────────────────────────────────────────────

interface ExecError {
  stderr?: string;
  stdout?: string;
  message?: string;
}

function isExecError(err: unknown): err is ExecError {
  return typeof err === 'object' && err !== null;
}

// ─── Interface ──────────────────────────────────────────────────────────────

export interface ShellExecutor {
  /** Execute a shell command. Returns trimmed stdout+stderr. */
  run(cmd: string, timeout?: number): string;
}

// ─── Real implementation ───────────────────────────────────────────────────

export class RealShellExecutor implements ShellExecutor {
  run(cmd: string, timeout = 30_000): string {
    try {
      const out = execSync(cmd, {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 1024 * 1024, // 1 MB
      });
      return out.trim();
    } catch (err: unknown) {
      if (isExecError(err)) {
        return err.stderr?.trim() || err.stdout?.trim() || err.message || String(err);
      }
      return String(err);
    }
  }
}

/** Default singleton executor for production use. */
export const defaultExecutor: ShellExecutor = new RealShellExecutor();
