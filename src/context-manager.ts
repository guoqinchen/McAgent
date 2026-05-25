/**
 * Context window management for McAgent.
 *
 * Provides token estimation and message eviction to prevent the conversation
 * history from exceeding the model's context window limit.
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Token estimation ───────────────────────────────────────────────────────

// CJK range constant — hoisted to avoid re-allocation
const CJK_START = 0x4e00;
const CJK_END = 0x9fff;

/**
 * Rough token estimate based on character length.
 *
 * - ASCII/Latin: ~4 chars per token
 * - CJK: ~2 chars per token
 * - Per-message overhead: ~4 tokens
 *
 * Uses an indexed for-loop (faster than for…of in V8) with a precomputed
 * CJK range constant. This is a fast approximation without a real tokenizer.
 * It's conservative enough to prevent context overflow in practice.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const len = text.length;
  let tokens = 0;
  // C-style loop is ~2x faster in V8 than for…of for string iteration
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code >= CJK_START && code <= CJK_END) {
      tokens += 0.5;
    } else {
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Estimate total tokens for an array of messages including metadata overhead.
 */
export function estimateMessageTokens(messages: ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateSingleMessageTokens(msg);
  }
  return total;
}

/**
 * Estimate tokens for a single message including overhead.
 * Used by evictMessages to compute per-message token cost incrementally.
 */
function estimateSingleMessageTokens(msg: ChatCompletionMessageParam): number {
  let total = 0;

  // Text content
  total += estimateTokens((msg.content as string) || '');

  // Tool call arguments (only on assistant messages with function calls)
  if ('tool_calls' in msg && msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      if (tc.type === 'function' && tc.function?.arguments) {
        total += estimateTokens(tc.function.arguments);
      }
    }
  }

  // Per-message overhead (role markers, metadata)
  total += 4;

  return total;
}

// ─── Eviction policy ────────────────────────────────────────────────────────

/** Minimum number of messages to keep in history (system + at least 1 exchange). */
const MIN_MESSAGES_TO_KEEP = 5;

/**
 * Evict messages from history when estimated token count exceeds `maxTokens`.
 *
 * Policy:
 * 1. Keep the system prompt (first message) unconditionally.
 * 2. Remove oldest user/assistant message pairs first (evicting both halves).
 * 3. Keep orphaned tool messages that belong to surviving assistant calls.
 * 4. Always keep at least MIN_MESSAGES_TO_KEEP messages.
 *
 * Performance: O(n) — computes per-message token counts once, then tracks
 * the running total incrementally instead of re-scanning on every removal.
 *
 * @returns A new array with evicted messages removed (does not mutate original).
 */
export function evictMessages(
  messages: ChatCompletionMessageParam[],
  maxTokens: number
): ChatCompletionMessageParam[] {
  if (messages.length <= MIN_MESSAGES_TO_KEEP) return messages;

  // Compute per-message token counts once — O(n)
  const perMsgTokens: number[] = messages.map(estimateSingleMessageTokens);
  let totalTokens = perMsgTokens.reduce((a, b) => a + b, 0);

  if (totalTokens <= maxTokens) return messages;

  // Work on a copy
  const result = [...messages];
  // Keep token counts in sync with result
  const tokenCounts = [...perMsgTokens];

  // Helper: remove item at index and update totals
  function removeAt(idx: number): void {
    totalTokens -= tokenCounts[idx];
    result.splice(idx, 1);
    tokenCounts.splice(idx, 1);
  }

  // Phase 1: Remove oldest user messages and their paired assistant/tool responses
  for (let i = 1; i < result.length && totalTokens > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i++) {
    const msg = result[i];
    if (msg.role === 'user') {
      // Remove this user message
      removeAt(i);
      i--;

      // Remove the following assistant or tool response if it belongs to this exchange
      if (i + 1 < result.length && (result[i + 1]?.role === 'assistant' || result[i + 1]?.role === 'tool')) {
        removeAt(i + 1);
      }
    }
  }

  // Phase 2: If still over limit, remove unpaired tool messages
  if (totalTokens > maxTokens) {
    for (let i = result.length - 1; i >= 1 && totalTokens > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i--) {
      if (result[i]?.role === 'tool') {
        removeAt(i);
      }
    }
  }

  return result;
}

// ─── Default limits ─────────────────────────────────────────────────────────

/**
 * Default max tokens for the context window.
 * DeepSeek-V4 supports up to 1M context tokens; we leave generous headroom
 * for the response so the model always has room to generate.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 96_000;
