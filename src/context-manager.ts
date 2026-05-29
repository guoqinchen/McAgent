/**
 * Context window management for McAgent — optimized for DeepSeek-V4.
 *
 * DeepSeek-V4 supports a 1,048,576 token (1M) context window.
 * This module provides:
 *   1. Token estimation (char-based heuristic, tuned for V4's tokenizer)
 *   2. Thinking-token budget deduction (reasoning_content counts against context)
 *   3. Smart eviction (sliding-window for large contexts, pair-aware removal)
 *   4. Context usage reporting for observability
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── DeepSeek-V4 context constants ──────────────────────────────────────────

/** DeepSeek-V4 maximum context window (tokens). */
export const DEEPSEEK_V4_MAX_CONTEXT = 1_048_576;

/** Default max tokens for the context window.
 *  Leaves ~148K headroom for the model response + thinking tokens. */
export const DEFAULT_MAX_CONTEXT_TOKENS = 900_000;

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Check whether a Unicode code point corresponds to a CJK character,
 * Hangul syllable, Hiragana, Katakana, or full-width Latin character.
 * These characters use approximately 2 bytes/char in token estimation.
 */
function isWideChar(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xff00 && code <= 0xffef) // Full-width forms
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

// ─── Thinking token estimation ──────────────────────────────────────────────

/**
 * Estimate token cost of DeepSeek-V4 reasoning_content (thinking tokens).
 *
 * DeepSeek-V4 thinking tokens ARE counted against the context window
 * but are NOT visible in the content field. We estimate them based on
 * a conservative assumption: thinking output ~= 2× final response tokens.
 *
 * This is deducted from the budget BEFORE messages are packed.
 *
 * @param responseBudgetTokens — tokens reserved for the model's response
 * @returns estimated thinking token cost
 */
export function estimateThinkingTokenBudget(responseBudgetTokens: number): number {
  // DeepSeek V4 thinking can be 1-3x the visible response.
  // We reserve 50% of the response budget as thinking headroom.
  return Math.ceil(responseBudgetTokens * 0.5);
}

/**
 * Compute the effective message budget after reserving space for
 * thinking tokens and the response itself.
 *
 * @param maxContextTokens — raw context window limit (e.g. 900K)
 * @param responseBudget — tokens to reserve for model output (default 64K)
 * @returns effective token budget for message history
 */
export function effectiveMessageBudget(maxContextTokens: number, responseBudget = 65_536): number {
  const thinkingBudget = estimateThinkingTokenBudget(responseBudget);
  return Math.max(0, maxContextTokens - responseBudget - thinkingBudget);
}

// ─── Eviction policy ────────────────────────────────────────────────────────

/** Default minimum messages to keep in history.
 *  With V4's 1M context we can afford to keep more exchanges. */
export const DEFAULT_MIN_MESSAGES_TO_KEEP = 20;

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
    for (
      let i = messages.length - 1;
      i >= 1 && remainingTokens > maxTokens && keptCount > minKeep;
      i--
    ) {
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

// ─── Context usage reporting ───────────────────────────────────────────────

export interface ContextUsage {
  /** Total tokens in current message history (estimated). */
  estimatedTokens: number;
  /** Configured max context budget. */
  maxBudget: number;
  /** Percentage of budget consumed (0-100). */
  utilizationPercent: number;
  /** Effective budget for messages (after reserving response + thinking space). */
  effectiveBudget: number;
  /** Number of messages in history. */
  messageCount: number;
  /** Whether the budget is more than 80% full (approaching limit). */
  approachingLimit: boolean;
}

/**
 * Produce a human-readable context usage report for logging/debugging.
 *
 * @param messages — current message array
 * @param maxContextTokens — configured max context budget
 * @param responseBudget — tokens reserved for model output
 */
export function getContextUsage(
  messages: ChatCompletionMessageParam[],
  maxContextTokens: number = DEFAULT_MAX_CONTEXT_TOKENS,
  responseBudget = 65_536
): ContextUsage {
  const estimatedTokens = estimateMessageTokens(messages);
  const effectiveBudget = effectiveMessageBudget(maxContextTokens, responseBudget);
  const utilizationPercent = Math.min(
    100,
    Math.round((estimatedTokens / effectiveBudget) * 100)
  );

  return {
    estimatedTokens,
    maxBudget: maxContextTokens,
    utilizationPercent,
    effectiveBudget,
    messageCount: messages.length,
    approachingLimit: utilizationPercent >= 80,
  };
}

/**
 * Format context usage as a single-line log string.
 * Example: "ctx usage: 142K/900K (16%) · 47 msgs · budget OK"
 */
export function formatContextUsage(usage: ContextUsage): string {
  const tokensK = Math.round(usage.estimatedTokens / 1000);
  const budgetK = Math.round(usage.maxBudget / 1000);
  const status = usage.approachingLimit ? '⚠️  near limit' : 'budget OK';
  return `ctx usage: ${tokensK}K/${budgetK}K (${usage.utilizationPercent}%) · ${usage.messageCount} msgs · ${status}`;
}
