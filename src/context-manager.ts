/**
 * Context window management for McAgent.
 *
 * Provides token estimation and message eviction to prevent the conversation
 * history from exceeding the model's context window limit.
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Check whether a Unicode code point corresponds to a CJK character,
 * Hangul syllable, Hiragana, Katakana, or full-width Latin character.
 * These characters use approximately 2 bytes/char in token estimation.
 */
function isWideChar(code: number): boolean {
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
    (code >= 0xAC00 && code <= 0xD7AF) ||  // Hangul Syllables
    (code >= 0x3040 && code <= 0x309F) ||  // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||  // Katakana
    (code >= 0xFF00 && code <= 0xFFEF)     // Full-width forms
  );
}

/**
 * Rough token estimate based on character length.
 *
 * - ASCII/Latin: ~4 chars per token
 * - East Asian wide characters (CJK, Hangul, Kana): ~2 chars per token
 * - Per-message overhead: ~4 tokens
 *
 * Uses an indexed for-loop (faster than for…of in V8). This is a fast
 * approximation without a real tokenizer. It's conservative enough to
 * prevent context overflow in practice.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const len = text.length;
  let tokens = 0;
  // C-style loop is ~2x faster in V8 than for…of for string iteration
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (isWideChar(code)) {
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

/** Default minimum number of messages to keep in history (system + at least 1 exchange). */
export const DEFAULT_MIN_MESSAGES_TO_KEEP = 5;

/**
 * Evict messages from history when estimated token count exceeds `maxTokens`.
 *
 * Policy:
 * 1. Keep the system prompt (first message) unconditionally.
 * 2. Remove oldest user/assistant message pairs first (evicting both halves).
 * 3. Keep orphaned tool messages that belong to surviving assistant calls.
 * 4. Always keep at least `minKeep` messages.
 *
 * Performance: O(n) — single pass with filter, no splice mutations.
 *
 * @returns A new array with evicted messages removed (does not mutate original).
 */
export function evictMessages(
  messages: ChatCompletionMessageParam[],
  maxTokens: number,
  minKeep: number = DEFAULT_MIN_MESSAGES_TO_KEEP
): ChatCompletionMessageParam[] {
  if (messages.length <= minKeep) return messages;

  const perMsgTokens = messages.map(estimateSingleMessageTokens);
  const totalTokens = perMsgTokens.reduce((a, b) => a + b, 0);

  if (totalTokens <= maxTokens) return messages;

  // Single pass: mark which indices to keep
  const keep = new Array<boolean>(messages.length).fill(true);
  let remainingTokens = totalTokens;
  let keptCount = messages.length;

  // Phase 1: evict oldest user+assistant pairs from the front
  for (let i = 1; i < messages.length && remainingTokens > maxTokens && keptCount > minKeep; i++) {
    const msg = messages[i];
    if (keep[i] && msg.role === 'user') {
      // Evict user message
      keep[i] = false;
      remainingTokens -= perMsgTokens[i]!;
      keptCount--;

      // Evict subsequent assistant/tool messages until next user
       let j = i + 1;
       while (j < messages.length && remainingTokens > maxTokens) {
         const next = messages[j];
         if (next?.role === 'assistant' || next?.role === 'tool') {
           keep[j] = false;
           remainingTokens -= perMsgTokens[j]!;
           keptCount--;
           j++;
         } else {
           break;
         }
       }
    }
  }

  // Phase 2: evict remaining tool messages from the end if still over
  if (remainingTokens > maxTokens) {
    for (let i = messages.length - 1; i >= 1 && remainingTokens > maxTokens && keptCount > minKeep; i--) {
      if (keep[i] && messages[i]?.role === 'tool') {
        keep[i] = false;
        remainingTokens -= perMsgTokens[i]!;
        keptCount--;
      }
    }
  }

  // Filter in one pass
  return messages.filter((_, i) => keep[i]);
}

// ─── Default limits ─────────────────────────────────────────────────────────

/**
 * Default max tokens for the context window.
 * DeepSeek-V4 supports up to 1M context tokens; we leave generous headroom
 * for the response so the model always has room to generate.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 96_000;
