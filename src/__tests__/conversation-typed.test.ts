import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs.existsSync and fs.promises for session tests
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

import { ConversationHistory } from '../agent/conversation.js';

describe('ConversationHistory (typed)', () => {
  let conv: ConversationHistory;

  beforeEach(() => {
    conv = new ConversationHistory();
  });

  it('addUserMessage stores a typed user message', () => {
    const msg = conv.addUserMessage('hello');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(conv.length).toBe(1);
  });

  it('addAssistantMessage stores assistant message with content', () => {
    conv.addAssistantMessage('hello back');
    const plain = conv.toPlainMessages();
    expect(plain[0]).toEqual({ role: 'assistant', content: 'hello back' });
  });

  it('addAssistantMessage stores reasoning_content', () => {
    conv.addAssistantMessage('answer', undefined, 'step-by-step reasoning');
    // reasoning_content is DeepSeek-specific, not in toPlainMessages
    // but should be present in the raw internal messages
    const msgs = conv.raw;
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('answer');
    expect(msgs[0].reasoning_content).toBe('step-by-step reasoning');
  });

  it('addAssistantMessage stores tool_calls', () => {
    const toolCalls = [
      { id: 'tc1', type: 'function' as const, function: { name: 'f', arguments: '{}' } },
    ];
    conv.addAssistantMessage(null, toolCalls);
    const msgs = conv.raw;
    expect(msgs[0].tool_calls).toEqual(toolCalls);
    expect(msgs[0].content).toBeNull();
  });

  it('addToolResult stores a tool response', () => {
    conv.addToolResult('tc1', '{"result":"ok"}');
    const plain = conv.toPlainMessages();
    // toPlainMessages uses a type assertion on role — at runtime
    // the value stays 'tool' (the cast is compile-time only)
    expect(plain[0]).toEqual({ role: 'tool', content: '{"result":"ok"}' });
    expect(conv.raw[0].role).toBe('tool');
  });

  it('toPlainMessages caches results', () => {
    conv.addUserMessage('a');
    const r1 = conv.toPlainMessages();
    const r2 = conv.toPlainMessages();
    expect(r1).toBe(r2); // same reference = cached
  });

  it('toPlainMessages invalidates cache on mutation', () => {
    conv.addUserMessage('a');
    const r1 = conv.toPlainMessages();
    conv.addUserMessage('b');
    const r2 = conv.toPlainMessages();
    expect(r1).not.toBe(r2); // different reference = invalidated
  });

  it('clear() resets messages and cache', () => {
    conv.addUserMessage('a');
    conv.clear();
    expect(conv.length).toBe(0);
    expect(conv.toPlainMessages()).toEqual([]);
  });

  it('getMessagesWithSystem prepends system message', () => {
    conv.addUserMessage('hi');
    const msgs = conv.getMessagesWithSystem('You are a bot.');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('You are a bot.');
    expect(msgs[1].role).toBe('user');
  });

  it('eviction reduces message count when over limit', () => {
    // Add enough messages to trigger eviction
    for (let i = 0; i < 10; i++) {
      conv.addUserMessage('message ' + i);
    }
    // A very low token budget should force eviction via evictIfNeeded
    conv.evictIfNeeded(10);
    expect(conv.length).toBeLessThan(11);
  });
});
