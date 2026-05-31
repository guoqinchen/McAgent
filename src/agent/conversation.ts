/**
 * Conversation history management for McAgent.
 *
 * Handles message storage, system-prompt composition, context eviction,
 * and session persistence — all in one place so agent.ts doesn't need to.
 */

import { existsSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { evictMessages, DEFAULT_MAX_CONTEXT_TOKENS } from '../context-manager.js';
import type { Message } from '../types/events.js';

/** Valid message roles for validation. */
const VALID_ROLES = new Set(['user', 'assistant', 'system', 'tool']);

/**
 * Validate that raw parsed JSON is a valid array of message objects.
 * Returns the validated messages or throws on invalid input.
 */
function validateMessages(raw: unknown): ChatCompletionMessageParam[] {
  if (!Array.isArray(raw)) {
    throw new Error('Invalid session file: expected array');
  }

  for (let i = 0; i < raw.length; i++) {
    const msg = raw[i];
    if (typeof msg !== 'object' || msg === null) {
      throw new Error(`Invalid message at index ${i}: expected object`);
    }
    const m = msg as Record<string, unknown>;
    if (!VALID_ROLES.has(m.role as string)) {
      throw new Error(`Invalid message at index ${i}: unknown role "${String(m.role)}"`);
    }
  }

  return raw as ChatCompletionMessageParam[];
}

export class ConversationHistory {
  private static readonly MAX_MESSAGES = 200;
  private static readonly MAX_CONTEXT_TOKENS_PER_CALL = 800_000;

  /** Stored as the wider ChatCompletionMessageParam so evictMessages works without casting. */
  private messages: ChatCompletionMessageParam[] = [];
  /** Cache for toPlainMessages(). Uses dirty flag for selective invalidation. */
  private cachedPlain: Message[] | null = null;
  private cacheDirty = true;

  // ── Mutations ────────────────────────────────────────────────────────────

  private markCacheDirty(): void {
    this.cacheDirty = true;
    this.cachedPlain = null;
  }

  addUserMessage(content: string): ChatCompletionMessageParam {
    const msg: ChatCompletionMessageParam = { role: 'user', content };
    this.messages.push(msg);
    this.markCacheDirty();
    return msg;
  }

  addAssistantMessage(
    content: string | null,
    toolCalls?: ChatCompletionMessageToolCall[],
    reasoningContent?: string
  ): void {
    const msg = {
      role: 'assistant' as const,
      content,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    };
    // Cast through a loose type then to ChatCompletionMessageParam
    // because ChatCompletionAssistantMessageParam doesn't include reasoning_content.
    this.messages.push(msg as ChatCompletionMessageParam);
    this.markCacheDirty();
  }

  addToolResult(toolCallId: string, content: string): void {
    const MAX_TOOL_RESULT_CHARS = 100_000;
    const truncated = content.length > MAX_TOOL_RESULT_CHARS
      ? content.slice(0, MAX_TOOL_RESULT_CHARS) +
        `\n… [truncated: ${content.length.toLocaleString()} total chars]`
      : content;
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: truncated,
    });

    if (this.messages.length > ConversationHistory.MAX_MESSAGES) {
      this.evictIfNeeded(ConversationHistory.MAX_CONTEXT_TOKENS_PER_CALL);
    }
  }

  addToolWarning(toolCallId: string, warning: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({ warning }),
    });
    // Tool warnings are not shown in toPlainMessages(), so no cache invalidation needed
  }

  clear(): void {
    this.messages = [];
    this.markCacheDirty();
  }

  // ── Eviction ─────────────────────────────────────────────────────────────

  /**
   * Explicitly trigger context eviction based on token budget and message count.
   * Mutates internal state if eviction occurs — separated from the
   * getter for clarity.
   */
  evictIfNeeded(maxContextTokens: number = DEFAULT_MAX_CONTEXT_TOKENS): void {
    if (this.messages.length === 0) return;

    if (this.messages.length > ConversationHistory.MAX_MESSAGES) {
      const targetSize = Math.floor(ConversationHistory.MAX_MESSAGES * 0.7);
      while (this.messages.length > targetSize) {
        this.messages.shift();
      }
      this.markCacheDirty();
      return;
    }

    if (maxContextTokens <= 0) return;

    const withSystem: ChatCompletionMessageParam[] = [
      { role: 'system', content: '' },
      ...this.messages,
    ];

    const evicted = evictMessages(withSystem, maxContextTokens);
    if (evicted.length < withSystem.length) {
      this.messages = evicted.length > 1 ? evicted.slice(1) : [];
      this.markCacheDirty();
    }
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Build the full message array including system prompt.
   * Pure function — does NOT mutate internal state. Call evictIfNeeded()
   * separately before this if eviction is desired.
   */
  getMessagesWithSystem(systemPrompt: string): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.messages,
    ];

    // Strip reasoning_content from assistant messages before sending to API.
    // reasoning_content is DeepSeek-specific output-only — sending it back
    // wastes tokens and may cause errors with strict API validation.
    for (const msg of result) {
      if (msg.role === 'assistant' && 'reasoning_content' in msg) {
        delete (msg as Record<string, unknown>).reasoning_content;
      }
    }

    return result;
  }

  /** Return a simplified copy of the conversation for display. */
  toPlainMessages(): Message[] {
    if (!this.cacheDirty && this.cachedPlain) return this.cachedPlain;

    this.cachedPlain = this.messages.map((m: ChatCompletionMessageParam) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c: { text?: string }) => ('text' in c ? c.text : '')).join('')
            : '',
      timestamp: new Date().toISOString(),
    }));
    this.cacheDirty = false;
    return this.cachedPlain;
  }

  get length(): number {
    return this.messages.length;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get raw(): any[] {
    return this.messages;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  async save(path: string): Promise<void> {
    await writeFile(path, JSON.stringify(this.messages, null, 2), 'utf-8');
  }

  /**
   * Load conversation history from a JSON file with validation.
   * If the file does not exist or is invalid, clears history silently
   * instead of crashing.
   */
  async load(path: string): Promise<void> {
    if (existsSync(path)) {
      try {
        const raw = await readFile(path, 'utf-8');
        const parsed = JSON.parse(raw);
        this.messages = validateMessages(parsed);
      } catch {
        // Invalid or corrupted file — start fresh instead of crashing
        this.messages = [];
      }
    } else {
      this.messages = [];
    }
    this.markCacheDirty();
  }
}
