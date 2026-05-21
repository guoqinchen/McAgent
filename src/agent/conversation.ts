/**
 * Conversation history management for McAgent.
 *
 * Handles message storage, system-prompt composition, context eviction,
 * and session persistence — all in one place so agent.ts doesn't need to.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { evictMessages, DEFAULT_MAX_CONTEXT_TOKENS } from '../context-manager.js';
import type { Message } from '../types/events.js';

export class ConversationHistory {
  private messages: ChatCompletionMessageParam[] = [];

  // ── Mutations ────────────────────────────────────────────────────────────

  addUserMessage(content: string): ChatCompletionMessageParam {
    const msg: ChatCompletionMessageParam = { role: 'user', content };
    this.messages.push(msg);
    return msg;
  }

  addAssistantMessage(content: string | null, toolCalls?: unknown): void {
    if (toolCalls) {
      this.messages.push({
        role: 'assistant',
        content,
        tool_calls: toolCalls,
      } as unknown as ChatCompletionMessageParam);
    } else {
      this.messages.push({ role: 'assistant', content });
    }
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content,
    });
  }

  addToolWarning(toolCallId: string, warning: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content: JSON.stringify({ warning }),
    });
  }

  clear(): void {
    this.messages = [];
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

    // Evict old messages if context is getting full
    if (maxContextTokens > 0) {
      const evicted = evictMessages(result, maxContextTokens);
      if (evicted.length < result.length) {
        // Update internal state (strip system prompt)
        this.messages = evicted.length > 1 ? evicted.slice(1) : [];
        result = evicted; // use evicted for this call
      }
    }

    return result;
  }

  /** Return a simplified copy of the conversation for display. */
  toPlainMessages(): Message[] {
    return this.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content:
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c) => ('text' in c ? c.text : '')).join('')
            : '',
    }));
  }

  get length(): number {
    return this.messages.length;
  }

  /** Access raw messages (for tool execution). */
  get raw(): ChatCompletionMessageParam[] {
    return this.messages;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  save(path: string): void {
    writeFileSync(path, JSON.stringify(this.messages, null, 2), 'utf-8');
  }

  load(path: string): void {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      this.messages = JSON.parse(raw);
    } else {
      this.messages = [];
    }
  }
}
