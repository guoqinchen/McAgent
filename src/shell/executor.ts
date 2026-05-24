/**
 * Shell execution abstraction for McAgent.
 *
 * Provides a unified interface for running shell commands asynchronously,
 * with a real implementation and a mock implementation for testing.
 *
 * Uses child_process.exec (async) instead of execSync to avoid blocking
 * the Node.js event loop — a synchronous call on a slow or hanging command
 * would freeze the entire TUI and prevent any output.
 */

import { exec, type ExecException } from 'node:child_process';

// ─── Interface ──────────────────────────────────────────────────────────────

export interface ShellExecutor {
  /** Execute a shell command. Returns a Promise resolving to trimmed stdout+stderr. */
  run(cmd: string, timeout?: number): Promise<string>;
}

// ─── Real implementation ───────────────────────────────────────────────────

export class RealShellExecutor implements ShellExecutor {
  async run(cmd: string, timeout = 30_000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      exec(
        cmd,
        {
          encoding: 'utf-8',
          timeout,
          maxBuffer: 1024 * 1024, // 1 MB
        },
        (err: ExecException | null, stdout: string, stderr: string) => {
          if (err) {
            // System errors (command not found, permission denied, etc.)
            // have a string err.code (e.g. 'ENOENT', 'EACCES').
            // These are infrastructure failures — reject so callers can
            // distinguish them from command failures.
            if (typeof err.code === 'string' || err.killed || err.signal) {
              reject(new Error(err.message));
              return;
            }
            // Non-zero exit code: command ran but failed — return stderr
            // so the LLM can see what went wrong.
            resolve(
              (stderr?.trim() || stdout?.trim() || err.message || String(err))
            );
          } else {
            resolve(stdout.trim());
          }
        }
      );
    });
  }
}

/** Default singleton executor for production use. */
export const defaultExecutor: ShellExecutor = new RealShellExecutor();
