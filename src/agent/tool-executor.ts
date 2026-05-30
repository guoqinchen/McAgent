/**
 * ToolExecutor — discovers + invokes tools and records metrics.
 *
 * Extracted from MacOSAgent to separate the tool-calling concern.
 * Enhanced with progress tracking and timing estimation for long-running tools.
 */

import type { Tool } from '../types/tool.js';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';
import { metricsCollector } from '../monitoring/metrics-collector.js';
import type { ToolProgress } from '../types/events.js';

export interface ToolResult {
  toolCallId: string;
  content: string;
}

/** Known estimated durations for tools (in ms). Used for progress estimation. */
const TOOL_ESTIMATED_DURATIONS: Record<string, number> = {
  run_command: 15_000,
  brew_info: 8_000,
  software_update: 30_000,
  network_diagnostics: 20_000,
  system_diagnostics: 10_000,
  system_logs: 12_000,
  find_files: 10_000,
  disk_usage: 5_000,
  security_check: 25_000,
  power_management: 5_000,
  list_processes: 4_000,
  get_network_info: 6_000,
  screenshot: 3_000,
  battery: 3_000,
};

export class ToolExecutor {
  constructor(private toolsByName: Map<string, Tool>) {}

  /**
   * Execute a batch of tool calls, returning results suitable for
   * conversation-history injection.
   * Emits progress callbacks for long-running tools (>2s threshold).
   */
  async executeAll(
    toolCalls: ChatCompletionMessageFunctionToolCall[],
    onCall?: (name: string, args: unknown) => void,
    onResult?: (name: string, result: unknown) => void,
    onError?: (error: Error) => void,
    onProgress?: (progress: ToolProgress) => void
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const tc of toolCalls) {
      const tool = this.toolsByName.get(tc.function.name);
      if (!tool) {
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
        });
        continue;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      onCall?.(tc.function.name, args);
      const start = Date.now();
      const toolName = tc.function.name;
      const estimatedTotal = TOOL_ESTIMATED_DURATIONS[toolName] || 10_000;

      // Start progress polling for long-running tools
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      if (onProgress) {
        progressTimer = setInterval(() => {
          const elapsed = Date.now() - start;
          const remaining = Math.max(0, estimatedTotal - elapsed);
          const pct = elapsed < 2000 ? null : Math.min(95, Math.round((elapsed / estimatedTotal) * 100));
          const status = buildProgressStatus(toolName, elapsed, remaining);
          onProgress({
            name: toolName,
            elapsedMs: elapsed,
            estimatedRemainingMs: elapsed > estimatedTotal ? 5_000 : remaining,
            progress: pct,
            status,
          });
        }, 200); // Update every 200ms for smooth progress display
      }

      try {
        const result = await tool.execute(args);
        if (progressTimer) clearInterval(progressTimer);
        const totalTime = Date.now() - start;
        metricsCollector.recordToolCall(totalTime, true, toolName);

        // Emit final progress at 100%
        if (onProgress && totalTime > 2000) {
          onProgress({
            name: toolName,
            elapsedMs: totalTime,
            estimatedRemainingMs: 0,
            progress: 100,
            status: `✅ ${toolName} completed in ${formatDuration(totalTime)}`,
          });
        }

        onResult?.(toolName, result);
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        if (progressTimer) clearInterval(progressTimer);
        const totalTime = Date.now() - start;
        metricsCollector.recordToolCall(totalTime, false, toolName);

        if (onProgress && totalTime > 2000) {
          onProgress({
            name: toolName,
            elapsedMs: totalTime,
            estimatedRemainingMs: null,
            progress: null,
            status: `❌ ${toolName} failed`,
          });
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        const error = new Error(`Tool ${toolName} failed: ${errMsg}`);
        onError?.(error);
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify({ error: `Tool execution failed: ${errMsg}` }),
        });
      }
    }

    return results;
  }
}

/** Build a human-readable progress status message. */
function buildProgressStatus(name: string, elapsedMs: number, remainingMs: number): string {
  const elapsed = formatDuration(elapsedMs);
  if (remainingMs <= 0) return `⏳ ${name} — ${elapsed} (finalizing…)`;
  const remaining = formatDuration(remainingMs);
  return `⏳ ${name} — ${elapsed} elapsed, ~${remaining} remaining`;
}

/** Format milliseconds to a short human-readable duration. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
