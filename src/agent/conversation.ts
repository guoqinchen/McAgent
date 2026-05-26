/**
 * Conversation history management for McAgent.
 *
 * Handles message storage, system-prompt composition, context eviction,
 * and session persistence — all in one place so agent.ts doesn't need to.
 */

import { existsSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { evictMessages, DEFAULT_MAX_CONTEXT_TOKENS } from '../context-manager.js';
import type { Message } from '../types/events.js';

export class ConversationHistory {
  /** Stored as the wider ChatCompletionMessageParam so evictMessages works without casting. */
  private messages: ChatCompletionMessageParam[] = [];
  /** Cache for toPlainMessages() — invalidated on every mutation. */
  private cachedPlain: Message[] | null = null;

  // ── Mutations ────────────────────────────────────────────────────────────

  private invalidateCache(): void {
    this.cachedPlain = null;
  }

  addUserMessage(content: string): ChatCompletionMessageParam {
    const msg: ChatCompletionMessageParam = { role: 'user', content };
    this.messages.push(msg);
    this.invalidateCache();
    return msg;
  }

  addAssistantMessage(
    content: string | null,
    toolCalls?: unknown,
    reasoningContent?: string
  ): void {
    const msg = {
      role: 'assistant' as const,
      content,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    };
    // Cast through DeepSeekAssistantMessage then to ChatCompletionMessageParam
    // because ChatCompletionAssistantMessageParam doesn't include reasoning_content.
    this.messages.push(msg as ChatCompletionMessageParam);
    this.invalidateCache();
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content,
    });
    this.invalidateCache();
  }

  addToolWarning(toolCallId: string, warning: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({ warning }),
    });
    this.invalidateCache();
  }

  clear(): void {
    this.messages = [];
    this.invalidateCache();
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Build the full message array including system prompt, with optional eviction.
   * Returns the messages to send to the API.
   * Also updates internal state if eviction occurs.
   */
  getMessagesWithSystem(
    systemPrompt: string,
    maxContextTokens: number = DEFAULT_MAX_CONTEXT_TOKENS
  ): ChatCompletionMessageParam[] {
    let result: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.messages,
    ];

    if (maxContextTokens > 0) {
      const evicted = evictMessages(result, maxContextTokens);
      if (evicted.length < result.length) {
        this.messages = evicted.length > 1 ? evicted.slice(1) : [];
        result = evicted;
        this.invalidateCache();
      }
    }

    return result;
  }

  /** Return a simplified copy of the conversation for display. */
  toPlainMessages(): Message[] {
    if (this.cachedPlain) return this.cachedPlain;
    this.cachedPlain = this.messages.map((m: ChatCompletionMessageParam) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c: { text?: string }) => ('text' in c ? c.text : '')).join('')
            : '',
    }));
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

  async load(path: string): Promise<void> {
    if (existsSync(path)) {
      const raw = await readFile(path, 'utf-8');
      this.messages = JSON.parse(raw);
    } else {
      this.messages = [];
    }
    this.invalidateCache();
  }
}
