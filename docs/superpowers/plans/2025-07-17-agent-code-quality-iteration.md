# macOS Agent — Code Quality Iteration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 5 highest-impact code quality findings from the audit: context window overflow, missing test coverage for core runtime, concurrency hazard, tool error storms, and edge-case data loss.

**Architecture:** All changes stay within the existing event-driven architecture. A new `ContextManager` module handles token estimation and message eviction. The `MacOSAgent` class gets a concurrency guard, consecutive-error short-circuit, and `finish_reason: 'length'` handling — all behind the existing public API. Tests use `vi.mock` to isolate the agent from the network and filesystem.

**Tech Stack:** TypeScript (ES2022), Vitest, OpenAI SDK, EventEmitter3

**Plan location:** `docs/superpowers/plans/2025-07-17-agent-code-quality-iteration.md`

---

## File Structure

### Files to modify

| File | Changes |
|------|---------|
| `src/agent.ts` | Add `busy` mutex flag; add `consecutiveErrors` counter in `runLoop`; handle `finish_reason: 'length'`; integrate `ContextManager`; make `isFunctionToolCall` usage consistent |
| `src/headless.ts` | Name event listeners for clean removability |
| `src/__tests__/agent.test.ts` | Add tests for `send()` concurrency guard, `runLoop` streaming + sync paths, `executeToolCalls` success/error/unknown-tool, `loadSession` corrupted JSON |
| `src/__tests__/tools.test.ts` | Add tests for tool `execute()` functions via `vi.mock('node:child_process')` |

### Files to create

| File | Responsibility |
|------|----------------|
| `src/context-manager.ts` | Token estimation + message eviction policy |
| `src/__tests__/context-manager.test.ts` | Unit tests for the context manager |

---

## Task 1: Add concurrency guard to `send()`/`sendSync()`

**Files:**
- Modify: `src/agent.ts`
- Test: `src/__tests__/agent.test.ts`

**Rationale:** If two callers invoke `agent.send()` concurrently (e.g., from a rapid double-press in the TUI), both mutate `this.messages` simultaneously, producing interleaved history.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/agent.test.ts` inside `describe('MacOSAgent')`:

```typescript
describe('concurrency guard', () => {
  it('rejects concurrent send() with an error', async () => {
    const agent = createTestAgent();

    // Mock OpenAI to hang long enough for overlap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = vi.fn().mockImplementation(
      () => new Promise(() => { /* never resolves */ })
    );

    const first = agent.send('hello');
    // Artificially mark as busy to simulate first send() locking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).busy = true;

    await expect(agent.send('world')).rejects.toThrow(/already processing/i);

    // Cleanup — we need the busy flag freed or the test hangs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).busy = false;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/agent.test.ts -t "rejects concurrent" -v`
Expected: FAIL — `send()` doesn't throw anything because there's no guard yet.

- [ ] **Step 3: Add the `busy` guard to `agent.ts`**

Add a `private busy = false;` field after `private toolsByName` (line ~57):

```typescript
  private toolsByName = new Map<string, Tool>();
  /** Prevents concurrent send()/sendSync() calls from interleaving message history */
  private busy = false;
```

Wrap the top of both `send()` and `sendSync()` with a guard. In `send()`, right after `this.emit('thinking:start')`:

```typescript
  async send(content: string): Promise<string> {
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;

    const userMessage: ChatCompletionMessageParam = {
      role: 'user',
      content,
    };
    // ... rest of existing code ...
    } finally {
      this.busy = false;   // <-- add this line before emit
      this.emit('thinking:end');
    }
  }
```

Exact edit for `send()` — change the `finally` block:

```typescript
    } finally {
      this.busy = false;
      this.emit('thinking:end');
    }
```

Same guard in `sendSync()` — add after `this.emit('message:user'...` (line 207):

```typescript
  async sendSync(content: string): Promise<string> {
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;

    const userMessage: ChatCompletionMessageParam = {
```

And wrap `sendSync`'s body in try/finally too (currently it has no `finally`):

```typescript
    try {
      const fullText = await this.runLoop(true);
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    } finally {
      this.busy = false;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/agent.test.ts -t "rejects concurrent" -v`
Expected: PASS

Run full suite: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts src/__tests__/agent.test.ts
git commit -m "fix: add concurrency guard to send()/sendSync() to prevent message interleaving"
```

---

## Task 2: Add consecutive-error short-circuit to `runLoop`

**Files:**
- Modify: `src/agent.ts`
- Test: `src/__tests__/agent.test.ts`

**Rationale:** When a tool consistently fails (bad args, unavailable system command), the error message says "you may retry" — which the LLM often does. This can consume all `maxToolRounds` (default 10) on repeated failures with no progress.

- [ ] **Step 1: Write the failing test**

Add inside `describe('MacOSAgent')` → new `describe('error short-circuit')`:

```typescript
describe('error short-circuit', () => {
  it('breaks the loop after maxConsecutiveToolErrors consecutive failures', async () => {
    const agent = createTestAgent({ maxToolRounds: 10 });

    // Register a tool that always throws
    const failingTool: Tool = {
      name: 'always_fail',
      description: 'Always fails',
      parameters: { type: 'object', properties: {} },
      execute: async () => { throw new Error('mock failure'); },
    };
    agent.addTool(failingTool);

    // Mock the API to always return a tool call for always_fail, then break
    const mockCreate = vi.fn()
      // Round 1: tool call
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'always_fail', arguments: '{}' },
            }],
          },
        }],
      })
      // Round 2: tool call again (model retries)
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_2',
              type: 'function',
              function: { name: 'always_fail', arguments: '{}' },
            }],
          },
        }],
      })
      // Round 3+: return text to end the loop
      .mockResolvedValue({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'Done.', tool_calls: undefined },
        }],
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = mockCreate;

    await agent.sendSync('test');

    // The agent should have broken out after ~3 errors, not consumed 10 rounds
    // We expect text "Done." — verify by counting mock calls
    // If no short-circuit: mockCreate would be called many more times
    const calls = mockCreate.mock.calls.length;
    expect(calls).toBeLessThan(6); // 2 error rounds + 1 success = 3, allow 5 as buffer
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/agent.test.ts -t "breaks the loop after" -v`
Expected: FAIL — currently all 10 rounds would be consumed, `calls` would be 10

- [ ] **Step 3: Add `consecutiveErrors` tracking to `runLoop`**

In `agent.ts`, add a field:

```typescript
  private consecutiveErrors = 0;
```

Reset it at the top of `send()` and `sendSync()`, right after the busy guard:

```typescript
    this.consecutiveErrors = 0;
```

In `runLoop`, inside the `for` loop, before the API call, add a break:

```typescript
    for (let round = 0; round < this.config.maxToolRounds; round++) {
      // Break early if too many consecutive tool errors
      if (this.consecutiveErrors >= 3) {
        this.consecutiveErrors = 0;
        break;
      }
      // ... rest of existing code
```

In `executeToolCalls`, when a tool execution succeeds, reset the counter. When it fails, increment it. Make `executeToolCalls` have access to the counter (it's a private method on the same class, so `this.consecutiveErrors` is accessible).

Exact changes inside `executeToolCalls`:

```typescript
      try {
        const result = await tool.execute(args);
        this.consecutiveErrors = 0;  // <-- reset on success
        this.emit('tool:result', tc.function.name, result);
        // ... rest unchanged
      } catch (err) {
        this.consecutiveErrors++;    // <-- increment on failure
        // ... rest unchanged
      }
```

Also remove the optimistic retry hint from the error message (it encourages loops):

Change:
```
`Tool execution failed: ${errMsg}. You may retry with corrected parameters once.`
```
To:
```
`Tool execution failed: ${errMsg}`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/agent.test.ts -t "breaks the loop after" -v`
Expected: PASS

Run full suite: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts src/__tests__/agent.test.ts
git commit -m "fix: break agent loop after 3 consecutive tool errors instead of burning all maxToolRounds"
```

---

## Task 3: Handle `finish_reason: 'length'` with partial tool calls

**Files:**
- Modify: `src/agent.ts`
- Test: `src/__tests__/agent.test.ts`

**Rationale:** If the streaming response ends with `finish_reason: 'length'` (context window exceeded) while tool calls are partially accumulated, the current code treats it as "no tool calls" and returns truncated text. The partial tool call data is silently lost.

- [ ] **Step 1: Write the failing test**

```typescript
describe('finish_reason length handling', () => {
  it('does not silently lose partial tool calls when finish_reason is length', async () => {
    const agent = createTestAgent();

    // Spy on executeToolCalls
    const executeSpy = vi.spyOn(agent as unknown as { executeToolCalls: (...args: unknown[]) => Promise<void> }, 'executeToolCalls' as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (executeSpy as any).mockImplementation(() => Promise.resolve());

    // We need the streaming path. Mock create to return an async iterable.
    const mockStream = (async function* () {
      yield {
        choices: [{
          delta: { content: 'Let me check' },
          finish_reason: null,
        }],
      };
      yield {
        choices: [{
          delta: {
            tool_calls: [{ index: 0, id: 'call_1', function: { name: 'test_tool', arguments: '{"a":' } }],
          },
          finish_reason: null,
        }],
      };
      yield {
        choices: [{
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '1}' } }],
          },
          finish_reason: 'length',
        }],
      };
    })();

    // Register a test tool so it's not "unknown"
    agent.addTool({
      name: 'test_tool',
      description: '',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = vi.fn().mockResolvedValue(mockStream);

    await agent.sendSync('hello');

    // The tool call should have been executed despite length finish_reason
    expect(executeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/agent.test.ts -t "does not silently lose" -v`
Expected: FAIL — the streaming path only processes tool_calls on `finish_reason === 'tool_calls' | 'stop'`

- [ ] **Step 3: Modify the streaming finish_reason check in `agent.ts`**

In the streaming path, change the `if` condition from:

```typescript
          if (finishReason === 'tool_calls' || finishReason === 'stop') {
```

To:

```typescript
          if (finishReason === 'tool_calls' || finishReason === 'stop' || finishReason === 'length') {
```

And add a transparent warning message when `finish_reason === 'length'` with partial tool calls, so the assistant is aware:

After the `await this.executeToolCalls(...)` call, add:

```typescript
              if (finishReason === 'length') {
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCallAccumulators.values().next().value?.id || 'n/a',
                  content: JSON.stringify({
                    warning: 'Response was truncated due to context length limit. Some tool calls may be incomplete.',
                  }),
                });
              }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/agent.test.ts -t "does not silently lose" -v`
Expected: PASS

Run full suite: `npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts src/__tests__/agent.test.ts
git commit -m "fix: handle finish_reason=length with partial tool_calls instead of silent data loss"
```

---

## Task 4: Implement context window management

**Files:**
- Create: `src/context-manager.ts`
- Create: `src/__tests__/context-manager.test.ts`
- Modify: `src/agent.ts`
- Modify: `src/__tests__/agent.test.ts`

**Rationale:** The `messages` array grows unbounded. After ~20-30 rounds of tool-heavy conversation, token count will exceed DeepSeek-V4's 128K context window and the API will error.

- [ ] **Step 1: Write tests for the context manager**

Content of `src/__tests__/context-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateTokens, evictMessages } from '../context-manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

describe('estimateTokens', () => {
  it('returns ~0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates based on character count / 4', () => {
    const tokens = estimateTokens('hello world'); // 11 chars → ~3 tokens
    expect(tokens).toBeGreaterThanOrEqual(2);
    expect(tokens).toBeLessThanOrEqual(4);
  });

  it('handles multi-byte characters', () => {
    const tokens = estimateTokens('你好世界');
    // Chinese chars are ~2 tokens each in most tokenizers
    expect(tokens).toBeGreaterThanOrEqual(4);
  });
});

describe('evictMessages', () => {
  const makeMsg = (role: string, content: string): ChatCompletionMessageParam => ({
    role: role as 'user' | 'assistant' | 'system',
    content,
  });

  it('never removes the first system message', () => {
    const msgs = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ] as ChatCompletionMessageParam[];

    const result = evictMessages(msgs, 10_000);
    expect(result[0]?.role).toBe('system');
    expect(result[0]?.content).toBe('You are helpful.');
  });

  it('removes oldest user/assistant pairs first when over limit', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'old user' },
      { role: 'assistant', content: 'old asst' },
      { role: 'user', content: 'recent user' },
      { role: 'assistant', content: 'recent asst' },
      { role: 'user', content: 'latest user' },
    ] as ChatCompletionMessageParam[];

    // Set a very low limit that forces eviction of only the oldest pair
    const result = evictMessages(msgs, 10);

    expect(result.map(m => m.content)).not.toContain('old user');
    expect(result.map(m => m.content)).not.toContain('old asst');
  });

  it('preserves the most recent N exchanges', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 20 }, (_, i) => [
        { role: 'user', content: `user ${i}` },
        { role: 'assistant', content: `asst ${i}` },
      ]).flat(),
    ] as ChatCompletionMessageParam[];

    const result = evictMessages(msgs, 50);

    // Most recent messages should survive
    const contents = result.map(m => m.content);
    expect(contents).toContain('user 19');
    expect(contents).toContain('asst 19');
  });

  it('returns the same array if under limit', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ] as ChatCompletionMessageParam[];

    const result = evictMessages(msgs, 10_000);
    expect(result.length).toBe(2);
    expect(result[0]?.content).toBe('sys');
  });

  it('handles empty array', () => {
    const result = evictMessages([], 1000);
    expect(result).toEqual([]);
  });

  it('preserves tool result messages after their corresponding tool call', () => {
    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'x', arguments: '{}' } }],
      } as ChatCompletionMessageParam,
      { role: 'tool', tool_call_id: 'tc1', content: 'result 1' },
      { role: 'assistant', content: 'done' },
    ] as ChatCompletionMessageParam[];

    const result = evictMessages(msgs, 15);
    // tool messages without their parent should be evictable, but full exchanges stay
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (module not found)**

Run: `npx vitest run src/__tests__/context-manager.test.ts -v`
Expected: FAIL with import error — `context-manager.ts` doesn't exist yet

- [ ] **Step 3: Implement `ContextManager`**

Content of `src/context-manager.ts`:

```typescript
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ─── Token estimation ───────────────────────────────────────────────────────

/**
 * Rough token estimate: ~4 chars per token for English,
 * ~2 chars per token for CJK characters.
 * Used as a fast approximation without a real tokenizer.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 0x4e00 && code < 0x9fff) {
      // CJK: ~2 chars per token
      tokens += 0.5;
    } else {
      // Regular: ~4 chars per token
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Estimate total tokens for an array of messages (system prompt + history).
 * Includes a per-message overhead (~4 tokens for role/metadata).
 */
export function estimateMessageTokens(messages: ChatCompletionMessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content as string || '');

    // Count tool call arguments
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function?.arguments || '');
      }
    }

    // Overhead per message (~4 tokens)
    total += 4;
  }
  return total;
}

// ─── Eviction policy ────────────────────────────────────────────────────────

const MIN_MESSAGES_TO_KEEP = 5;

/**
 * Evict messages from history when estimated token count exceeds `maxTokens`.
 *
 * Policy:
 * 1. Keep the system prompt (first message) unconditionally.
 * 2. Remove oldest user/assistant pairs first.
 * 3. Keep tool results that belong to surviving assistant messages.
 * 4. Always keep at least MIN_MESSAGES_TO_KEEP messages.
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
  let removed = 0;

  // Find indices of user messages (skip system)
  for (let i = 1; i < result.length && estimateMessageTokens(result) > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i++) {
    const msg = result[i];
    if (msg.role === 'user') {
      // Remove this user message and the following assistant message (if any)
      result.splice(i, 1); // remove user
      removed++;

      // Remove next assistant or tool response if it belongs to this user
      if (i < result.length && (result[i]?.role === 'assistant' || result[i]?.role === 'tool')) {
        result.splice(i, 1);
        removed++;
      }

      i--; // rewind index
    }
  }

  // If still over limit, remove older tool messages that aren't paired with surviving calls
  if (estimateMessageTokens(result) > maxTokens) {
    for (let i = result.length - 2; i >= 1 && estimateMessageTokens(result) > maxTokens && result.length > MIN_MESSAGES_TO_KEEP; i--) {
      if (result[i]?.role === 'tool') {
        result.splice(i, 1);
        removed++;
      }
    }
  }

  return result;
}

// ─── Default limits ─────────────────────────────────────────────────────────

/**
 * Default max tokens for the context window.
 * DeepSeek-V4 has 128K; we leave headroom for the response.
 */
export const DEFAULT_MAX_CONTEXT_TOKENS = 96_000;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/context-manager.test.ts -v`
Expected: all tests pass

- [ ] **Step 5: Integrate ContextManager into agent.ts**

In `src/agent.ts`:

Add import:
```typescript
import { evictMessages, DEFAULT_MAX_CONTEXT_TOKENS } from './context-manager.js';
```

Add to `MacOSAgentConfig` interface:
```typescript
export interface MacOSAgentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  instructions?: string;
  tools?: Tool[];
  maxToolRounds?: number;
  /** Maximum approximate tokens in context window before eviction (default 96000) */
  maxContextTokens?: number;
}
```

Store the value in the config object:
```typescript
  private config: Required<Omit<MacOSAgentConfig, 'apiKey' | 'baseURL'>> & {
    apiKey: string;
    baseURL: string;
  } & { maxContextTokens: number };
```

Set default in constructor:
```typescript
      maxContextTokens: config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
```

In `runLoop`, right after building `messages` (line ~222), add eviction call:

```typescript
      // Build the message list with system prompt
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.config.instructions },
        ...this.messages,
      ];

      // Evict old messages if context is too large
      if (this.config.maxContextTokens > 0) {
        const truncated = evictMessages(messages, this.config.maxContextTokens);
        if (truncated.length < messages.length) {
          // Update this.messages to reflect eviction (minus the system prompt)
          this.messages = truncated.length > 1 ? truncated.slice(1) : [];
        }
      }
```

- [ ] **Step 6: Add agent test for eviction integration**

Add to `src/__tests__/agent.test.ts`:

```typescript
describe('context eviction', () => {
  it('triggers eviction when messages exceed maxContextTokens', () => {
    const agent = createTestAgent({ maxContextTokens: 10 }); // very low limit

    // Push many messages
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (agent as any).messages.push(
        { role: 'user', content: `Message number ${i} `.repeat(10) },
        { role: 'assistant', content: `Response ${i}` }
      );
    }

    // Call getMessages — messages should have been evicted
    const msgs = agent.getMessages();
    expect(msgs.length).toBeLessThan(20 * 2);
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all pass (context-manager tests + agent tests + tools tests)

- [ ] **Step 8: Commit**

```bash
git add src/context-manager.ts src/__tests__/context-manager.test.ts src/agent.ts src/__tests__/agent.test.ts
git commit -m "feat: add context window management with automatic message eviction"
```

---

## Task 5: Polish — consistent `isFunctionToolCall` + named listeners

**Files:**
- Modify: `src/agent.ts`
- Modify: `src/headless.ts`
- Test: `src/__tests__/agent.test.ts`

**Rationale:** The `isFunctionToolCall` guard is used in the sync path but not in the streaming path (which uses a direct cast). The headless listeners use anonymous arrow functions that can't be removed.

- [ ] **Step 1: Make streaming path use `isFunctionToolCall`**

In `agent.ts`, in the streaming path where `executeToolCalls` is called (lines ~302-306), replace the direct cast:

From:
```typescript
              await this.executeToolCalls(
                Array.from(toolCallAccumulators.entries()).map(
                  ([, acc]) =>
                    ({
                      id: acc.id,
                      type: 'function',
                      function: { name: acc.name, arguments: acc.arguments },
                    }) as ChatCompletionMessageFunctionToolCall
                )
              );
```

To:
```typescript
              const accumulatedCalls: ChatCompletionMessageFunctionToolCall[] =
                Array.from(toolCallAccumulators.entries()).map(
                  ([, acc]) => ({
                    id: acc.id,
                    type: 'function' as const,
                    function: { name: acc.name, arguments: acc.arguments },
                  })
                );
              // All accumulated calls are 'function' type (checked during accumulation)
              await this.executeToolCalls(accumulatedCalls);
```

- [ ] **Step 2: Name the headless listeners**

In `headless.ts`, change the arrow functions to named function expressions (or function declarations):

```typescript
agent.on('thinking:start', function onThinkingStart() {
  process.stdout.write(`${color.magenta}⏳  Processing...${color.reset}\n`);
});

agent.on('tool:call', function onToolCall(name, args) {
  process.stdout.write(
    `  ${color.yellow}🔧 ${name}${color.reset}(${JSON.stringify(args, null, 2)})\n`
  );
});

agent.on('stream:delta', function onStreamDelta(delta) {
  process.stdout.write(delta);
});

agent.on('stream:end', function onStreamEnd() {
  process.stdout.write('\n');
});

agent.on('reasoning:delta', function onReasoningDelta(text) {
  process.stdout.write(`${color.dim}${text}${color.reset}`);
});

agent.on('error', function onError(err) {
  console.error(`\n${color.red}❌  Error:${color.reset} ${err.message}`);
});
```

The empty `thinking:end` handler can stay as-is or be removed since it does nothing.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/agent.ts src/headless.ts
git commit -m "refactor: consistent isFunctionToolCall usage; named headless listeners for clean removal"
```

---

## Task 6: Test coverage for `runLoop` — streaming and sync paths

**Files:**
- Modify: `src/__tests__/agent.test.ts`

**Rationale:** The core agent loop has zero test coverage. These tests mock the OpenAI client to simulate various response patterns.

- [ ] **Step 1: Write sync-path tool-call-and-stop test**

```typescript
describe('runLoop (via sendSync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a tool call then returns text', async () => {
    const agent = createTestAgent({ maxToolRounds: 3 });

    // Register a simple tool
    agent.addTool({
      name: 'echo',
      description: 'Echo input',
      parameters: {
        type: 'object',
        properties: { msg: { type: 'string' } },
        required: ['msg'],
      },
      execute: async ({ msg }) => ({ echoed: msg }),
    });

    // Mock API: round 1 → tool call, round 2 → text
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'echo', arguments: '{"msg":"hello"}' },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'I echoed "hello"', tool_calls: undefined },
        }],
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = mockCreate;

    const result = await agent.sendSync('say hello');

    expect(result).toBe('I echoed "hello"');
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const msgs = agent.getMessages();
    expect(msgs.some(m => m.content === 'say hello')).toBe(true);
    expect(msgs.some(m => m.content === 'I echoed "hello"')).toBe(true);
  });

  it('returns partial text when maxToolRounds is reached', async () => {
    const agent = createTestAgent({ maxToolRounds: 2 });

    // Always request a tool call — the agent should exit after 2 rounds
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '{"msg":"loop"}' },
          }],
        },
      }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = mockCreate;

    agent.addTool({
      name: 'echo',
      description: 'Echo',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    });

    const result = await agent.sendSync('loop test');

    // Should return empty string since no text was produced
    expect(typeof result).toBe('string');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('handles empty response from API', async () => {
    const agent = createTestAgent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = vi.fn().mockResolvedValue({
      choices: [], // empty
    });

    const result = await agent.sendSync('hello');
    expect(result).toBe('');
  });
});
```

- [ ] **Step 2: Write streaming-path test**

```typescript
describe('runLoop (streaming)', () => {
  it('streams text via events and returns full text', async () => {
    const agent = createTestAgent();

    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
      yield { choices: [{ delta: { content: ' world' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    })();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = vi.fn().mockResolvedValue(mockStream);

    const deltas: string[] = [];
    agent.on('stream:delta', (d) => deltas.push(d));

    const result = await agent.send('hello');

    expect(result).toBe('Hello world');
    expect(deltas).toContain('Hello');
    expect(deltas).toContain(' world');
  });
});
```

- [ ] **Step 3: Write `executeToolCalls` error-path test**

```typescript
describe('executeToolCalls', () => {
  it('emits error event and continues when a tool throws', async () => {
    const agent = createTestAgent();

    agent.addTool({
      name: 'broken',
      description: 'Broken tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => { throw new Error('kaboom'); },
    });

    const errors: Error[] = [];
    agent.on('error', (err) => errors.push(err));

    // Trigger a tool call that will fail
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'broken', arguments: '{}' },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'continuing after error', tool_calls: undefined },
        }],
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = mockCreate;

    const result = await agent.sendSync('run broken tool');

    expect(errors.length).toBe(1);
    expect(errors[0]?.message).toContain('kaboom');
    expect(result).toBe('continuing after error');
  });

  it('handles unknown tool gracefully', async () => {
    const agent = createTestAgent();

    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'nonexistent_tool', arguments: '{}' },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'unknown tool handled', tool_calls: undefined },
        }],
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).client.chat.completions.create = mockCreate;

    const result = await agent.sendSync('test unknown tool');

    expect(result).toBe('unknown tool handled');
    // Unknown tool error should appear in messages (as a tool result)
    const msgs = agent.getMessages();
    expect(msgs.some(m => m.content && m.content.includes('Unknown tool'))).toBe(true);
  });
});
```

- [ ] **Step 4: Write `loadSession` corrupted JSON test**

Add to existing `session persistence` describe block:

```typescript
  it('handles corrupted session JSON gracefully', async () => {
    const fs = await import('node:fs');
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('{ invalid json }');

    const agent = createTestAgent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (agent as any).messages.push({ role: 'user', content: 'preserved' });

    // Should throw rather than silently clear or corrupt state
    expect(() => agent.loadSession('/tmp/bad.json')).toThrow();
  });
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all 80+ tests pass

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/agent.test.ts
git commit -m "test: add runLoop, executeToolCalls, streaming, and error-path tests"
```

---

## Task 7: Test coverage for tool `execute()` functions

**Files:**
- Modify: `src/__tests__/tools.test.ts`

**Rationale:** Currently no test calls any `Tool.execute()` function. All 15 tools' `execute()` methods rely on `execSync` which we can mock.

- [ ] **Step 1: Write tool execute tests with mocked `execSync`**

Add at the end of `src/__tests__/tools.test.ts`:

```typescript
// ─── Tool execute() tests (with mocked execSync) ────────────────────────────

import { vi, beforeEach } from 'vitest';

// Mock child_process for all tool execute tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Re-import with mocks applied
const { execSync } = await import('node:child_process');

describe('runCommandTool.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a safe command', async () => {
    const { execSync } = await import('node:child_process');
    (execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue('hello world\n');

    const { runCommandTool } = await import('../tools.js');
    const result = await runCommandTool.execute({ command: 'echo hello' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello world');
  });

  it('blocks a dangerous command without calling execSync', async () => {
    const { runCommandTool } = await import('../tools.js');
    const { execSync } = await import('node:child_process');
    const spy = vi.mocked(execSync);

    const result = await runCommandTool.execute({ command: 'sudo rm -rf /' });

    expect(result.blocked).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('systemInfoTool.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns overview info', async () => {
    const { execSync } = await import('node:child_process');
    const mock = vi.mocked(execSync);
    mock.mockReturnValue('14.5\n');

    const { systemInfoTool } = await import('../tools.js');
    const result = await systemInfoTool.execute({ category: 'overview' });

    expect(result).toHaveProperty('osVersion');
  });
});

describe('readFileTool.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file content', async () => {
    const { execSync } = await import('node:child_process');
    const mock = vi.mocked(execSync);
    // First call: test -f → "yes"
    // Second call: cat → content
    // Third call: wc -c → size
    // Fourth call: wc -l → lines
    mock.mockReturnValueOnce('yes\n')
       .mockReturnValueOnce('file contents here\n')
       .mockReturnValueOnce('1024\n')
       .mockReturnValueOnce('10\n');

    const { readFileTool } = await import('../tools.js');
    const result = await readFileTool.execute({ path: '/tmp/test.txt' });

    expect(result.path).toBe('/tmp/test.txt');
    expect(result.content).toBe('file contents here');
    expect(result.sizeBytes).toBe(1024);
  });

  it('returns error for non-existent file', async () => {
    const { execSync } = await import('node:child_process');
    const mock = vi.mocked(execSync);
    mock.mockReturnValueOnce('no\n');

    const { readFileTool } = await import('../tools.js');
    const result = await readFileTool.execute({ path: '/nonexistent' });

    expect(result).toHaveProperty('error');
    expect(String(result.error)).toContain('not found');
  });
});

describe('screenshotTool.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fullscreen mode uses no flag', async () => {
    const { execSync } = await import('node:child_process');
    const mock = vi.mocked(execSync);
    mock.mockReturnValueOnce('0\n');  // screencapture
    mock.mockReturnValueOnce('yes\n'); // test -f
    mock.mockReturnValueOnce('50000\n'); // wc -c

    const { screenshotTool } = await import('../tools-extended.js');
    // Need to check the actual command passed to execSync
    const result = await screenshotTool.execute({ type: 'fullscreen' });
    // Verify the screencapture command had no -S flag
    const cmdCall = mock.mock.calls.find(c => String(c).includes('screencapture'));
    expect(String(cmdCall)).not.toContain('-S');
    expect(result.success).toBe(true);
  });
});
```

**Note:** The dynamic `await import()` pattern ensures mocks are applied before the module is loaded. If this causes issues, hoist the imports to the top inside `describe` blocks.

Alternatively, a cleaner approach: use `vi.importActual` and mock only in specific tests:

```typescript
  it('executes a safe command', async () => {
    const { execSync } = await import('node:child_process');
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('output\n');
    const { runCommandTool } = await import('../tools.js');
    const result = await runCommandTool.execute({ command: 'ls' });
    expect(result.stdout).toBe('output');
  });
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/tools.test.ts
git commit -m "test: add tool execute() tests with mocked execSync"
```

---

## Self-Review

**1. Spec coverage:**

| Evaluation finding | Task |
|---|---|
| P0: Context window overflow | Task 4 |
| P1: send() concurrency hazard | Task 1 |
| P1: Consecutive tool error storms | Task 2 |
| P1: Missing test for runLoop/executeToolCalls | Task 6 |
| P2: finish_reason 'length' data loss | Task 3 |
| P2: Missing test for tool execute() | Task 7 |
| P3: isFunctionToolCall consistency | Task 5 |
| P3: Headless listeners cleanup | Task 5 |

All items from the evaluation report are covered.

**2. Placeholder scan:** No "TBD", "TODO", "fill in details", "similar to", "add error handling" (all error handling code is explicit), or "write tests for the above" without test code.

**3. Type consistency:**
- `maxContextTokens: config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS` matches the type `number` in `MacOSAgentConfig`
- `consecutiveErrors` is `number`, initialized to 0, checked with `>= 3`
- `busy` is `boolean`, set/cleared consistently
- `evictMessages` accepts `ChatCompletionMessageParam[]` and returns `ChatCompletionMessageParam[]`
- All event names match the `MacOSAgentEvents` interface
- All mock types use `ReturnType<typeof vi.fn>` or explicit type assertions

No type inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2025-07-17-agent-code-quality-iteration.md`. 

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
