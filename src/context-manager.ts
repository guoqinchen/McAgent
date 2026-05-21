/**
 * Context window management for the macOS Agent.
 *
 * Provides token estimation and message eviction to prevent the conversation
 * history from exceeding the model's context window limit.
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Rough token estimate based on character length.
 *
 * - ASCII/Latin: ~4 chars per token
 * - CJK: ~2 chars per token
 * - Per-message overhead: ~4 tokens
 *
 * This is a fast approximation without a real tokenizer. It's conservative
 * enough to prevent context overflow in practice.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK Unified Ideographs: ~2 chars per token
      tokens += 0.5;
    } else {
      // Regular characters: ~4 chars per token
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
  }
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
 * @returns A new array with evicted messages removed (does not mutate original).
 */
export function evictMessages(
  messages: ChatCompletionMessageParam[],
  maxTokens: number
): ChatCompletionMessageParam[] {
  if (messages.length <= MIN_MESSAGES_TO_KEEP) return messages;

  const tokens = estimateMessageTokens(messages);
  if (tokens <= maxTokens) return messages;

  // Work on a copy
  const result = [...messages];

  // Phase 1: Remove oldest user messages and their paired assistant/tool responses
  for (let i = 1; i < result.length && estimateMessageTokens(result) > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i++) {
    const msg = result[i];
    if (msg.role === 'user') {
      // Remove this user message
      result.splice(i, 1);
      i--;

      // Remove the following assistant or tool response if it belongs to this exchange
      if (i + 1 < result.length && (result[i + 1]?.role === 'assistant' || result[i + 1]?.role === 'tool')) {
        result.splice(i + 1, 1);
      }
    }
  }

  // Phase 2: If still over limit, remove unpaired tool messages
  if (estimateMessageTokens(result) > maxTokens) {
    for (let i = result.length - 1; i >= 1 && estimateMessageTokens(result) > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i--) {
      if (result[i]?.role === 'tool') {
        result.splice(i, 1);
      }
    }
  }

  return result;
}

// ─── Default limits ─────────────────────────────────────────────────────────

/**
 * Default max tokens for the context window.
 * DeepSeek-V4 supports 128K tokens; we leave ~32K headroom for the response.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 96_000;
