/**
 * ToolExecutor — discovers + invokes tools and records metrics.
 *
 * Extracted from MacOSAgent to separate the tool-calling concern.
 */

import type { Tool } from '../types/tool.js';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';
import { metricsCollector } from '../monitoring/metrics-collector.js';

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export class ToolExecutor {
  constructor(private toolsByName: Map<string, Tool>) {}

  /**
   * Execute a batch of tool calls, returning results suitable for
   * conversation-history injection.
   */
  async executeAll(
    toolCalls: ChatCompletionMessageFunctionToolCall[],
    onCall?: (name: string, args: unknown) => void,
    onResult?: (name: string, result: unknown) => void,
    onError?: (error: Error) => void
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

      try {
        const result = await tool.execute(args);
        metricsCollector.recordToolCall(Date.now() - start, true, tc.function.name);
        onResult?.(tc.function.name, result);
        results.push({
          toolCallId: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        metricsCollector.recordToolCall(Date.now() - start, false, tc.function.name);
        const errMsg = err instanceof Error ? err.message : String(err);
        const error = new Error(`Tool ${tc.function.name} failed: ${errMsg}`);
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
