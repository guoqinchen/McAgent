/**
 * ToolCallAccumulator — manages incremental assembly of tool calls from
 * streaming delta chunks.
 *
 * Extracted from MacOSAgent.runLoop() to isolate the streaming tool-call
 * accumulation concern.
 */

import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions';

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Delta tool call shape as received from streaming chunks.
 */
export interface DeltaToolCall {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Manages incremental tool call accumulation from streaming deltas.
 *
 * Instead of rebuilding a Map from scratch on every chunk (as the original
 * runLoop() did), this class mutates accumulators in place, eliminating
 * unnecessary allocations.
 */
export class ToolCallAccumulator {
  private accumulators = new Map<number, AccumulatedToolCall>();

  /**
   * Process a delta.tool_calls array and update internal accumulators.
   * Each delta chunk may contain partial tool call data (split across chunks),
   * which this method merges incrementally.
   */
  processDelta(toolCalls: DeltaToolCall[]): void {
    for (const tc of toolCalls) {
      const idx = tc.index;
      if (!this.accumulators.has(idx)) {
        this.accumulators.set(idx, { id: '', name: '', arguments: '' });
      }
      const acc = this.accumulators.get(idx)!;
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name = tc.function.name;
      if (tc.function?.arguments) acc.arguments += tc.function.arguments;
    }
  }

  /** Check if any tool calls have been accumulated. */
  hasToolCalls(): boolean {
    return this.accumulators.size > 0;
  }

  /**
   * Get all accumulated tool calls as OpenAI-compatible
   * ChatCompletionMessageFunctionToolCall[].
   */
  getToolCalls(): ChatCompletionMessageFunctionToolCall[] {
    return Array.from(this.accumulators.entries()).map(([, acc]) => ({
      id: acc.id,
      type: 'function' as const,
      function: { name: acc.name, arguments: acc.arguments },
    }));
  }

  /**
   * Get the raw tool call accumulators for constructing
   * conversation history entries (keeps the original index ordering).
   */
  getEntries(): Array<[number, AccumulatedToolCall]> {
    return Array.from(this.accumulators.entries());
  }

  /** Clear all accumulated state (call before a new streaming round). */
  clear(): void {
    this.accumulators.clear();
  }

  /** Get count of accumulated tool calls. */
  get size(): number {
    return this.accumulators.size;
  }
}
