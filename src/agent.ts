/**
 * McAgent Core
 *
 * Standalone macOS AI agent using DeepSeek's OpenAI-compatible API.
 * Runs in any JS/TS runtime — no UI coupling.
 *
 * DeepSeek API: https://platform.deepseek.com/api-docs
 */

import OpenAI, { type OpenAI as OpenAIClient } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';
import { EventEmitter } from 'eventemitter3';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { evictMessages, DEFAULT_MAX_CONTEXT_TOKENS } from './context-manager.js';
import { setCommandAllowlist, setSkipDangerousCheck } from './tools.js';

// ─── Message types ──────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ─── Tool definition ────────────────────────────────────────────────────────

/**
 * A tool the agent can use.
 * `parameters` is a JSON Schema object (OpenAI-compatible).
 * `execute` is called when the model requests this tool.
 */
export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  /** If true, this tool performs no destructive/write operations. In readonly mode only these tools are available. */
  readonly?: boolean;
}

function toolToOpenAI(t: Tool): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  } as ChatCompletionTool;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isFunctionToolCall(
  tc: ChatCompletionMessageToolCall
): tc is ChatCompletionMessageFunctionToolCall {
  return tc.type === 'function';
}

/** Narrow a message or delta to a Record to access DeepSeek-specific fields like reasoning_content. */
function hasReasoning(input: unknown): input is { reasoning_content: string } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'reasoning_content' in input &&
    typeof (input as Record<string, unknown>).reasoning_content === 'string'
  );
}

// ─── Agent events (hooks) ───────────────────────────────────────────────────

export interface MacOSAgentEvents {
  /** User message was recorded */
  'message:user': (message: Message) => void;
  /** Full assistant message is complete */
  'message:assistant': (message: Message) => void;
  /** A text delta arrived during streaming */
  'stream:delta': (delta: string, accumulated: string) => void;
  /** Streaming finished */
  'stream:end': (fullText: string) => void;
  /** A tool was called */
  'tool:call': (name: string, args: unknown) => void;
  /** A tool returned a result */
  'tool:result': (name: string, result: unknown) => void;
  /** The model produced reasoning / thinking text (from DeepSeek's reasoning_content) */
  'reasoning:delta': (text: string) => void;
  /** Agent started processing */
  'thinking:start': () => void;
  /** Agent finished processing */
  'thinking:end': () => void;
  /** Error occurred */
  error: (error: Error) => void;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Permission mode for tool execution:
 * - "readonly": Only tools marked with readonly:true are available. Destructive tools (write, execute) are hidden.
 * - "approve": Default. Dangerous commands require user approval (current behavior via checkCommand).
 * - "auto": Automatically execute all commands without safety gate (for trusted environments).
 */
export type PermissionMode = 'readonly' | 'approve' | 'auto';

export interface MacOSAgentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  instructions?: string;
  tools?: Tool[];
  maxToolRounds?: number;
  /** Maximum approximate tokens in context window before eviction (default 96000). 0 disables eviction. */
  maxContextTokens?: number;
  /** Permission mode: 'readonly' | 'approve' | 'auto'. Default: 'approve'. */
  permissionMode?: PermissionMode;
  /** In 'auto' mode, these command prefixes bypass the dangerous pattern check. Default: ['git', 'npm', 'brew', 'ls', 'cat', 'echo']. */
  autoAllowlist?: string[];
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = 'deepseek-chat';

// ─── Agent class ─────────────────────────────────────────────────────────────

/**
 * macOS Expert Agent — standalone AI agent using DeepSeek.
 *
 * Emits typed events so any UI (Ink TUI, HTTP, Discord) can subscribe
 * without coupling to the agent internals.
 */
export class MacOSAgent extends EventEmitter<MacOSAgentEvents> {
  private client: OpenAIClient;
  private messages: ChatCompletionMessageParam[] = [];
  private config: Required<Omit<MacOSAgentConfig, 'apiKey' | 'baseURL'>> & {
    apiKey: string;
    baseURL: string;
    maxContextTokens: number;
    permissionMode: PermissionMode;
    autoAllowlist: string[];
  };
  private toolsByName = new Map<string, Tool>();
  /** Prevents concurrent send()/sendSync() calls from interleaving message history */
  private busy = false;
  /** Count of consecutive tool execution failures in the current send() call */
  private consecutiveErrors = 0;

  constructor(config: MacOSAgentConfig) {
    super();

    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? DEEPSEEK_BASE_URL,
      model: config.model ?? DEEPSEEK_MODEL,
      instructions:
        config.instructions ??
        `You are a macOS expert assistant. You help the user operate their Mac ` +
          `efficiently using CLI commands, system utilities, and automation. ` +
          `When the user asks you to do something, use the available tools to ` +
          `execute commands, inspect the system, and provide clear explanations. ` +
          `Always explain what a command will do before running it, especially ` +
          `commands that modify the system. Prefer safe, read-only operations ` +
          `unless the user explicitly asks for changes.`,
      tools: config.tools ?? [],
      maxToolRounds: config.maxToolRounds ?? 10,
      maxContextTokens: config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      permissionMode: config.permissionMode ?? 'approve',
      autoAllowlist: config.autoAllowlist ?? ['git', 'npm', 'brew', 'ls', 'cat', 'echo', 'mkdir', 'touch'],
    };

    // Sync allowlist and mode to tools module
    setCommandAllowlist(this.config.autoAllowlist);
    setSkipDangerousCheck(this.config.permissionMode === 'auto');

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

    for (const t of this.config.tools) {
      this.toolsByName.set(t.name, t);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** The model ID being used. */
  get model(): string {
    return this.config.model;
  }

  /** Return a copy of the conversation history (as plain Message objects). */
  getMessages(): Message[] {
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

  /** Clear all conversation history. */
  clearHistory(): void {
    this.messages = [];
  }

  /** Replace the system instructions. */
  setInstructions(instructions: string): void {
    this.config.instructions = instructions;
  }

  /** Register an additional tool at runtime. */
  addTool(tool: Tool): void {
    this.config.tools.push(tool);
    this.toolsByName.set(tool.name, tool);
  }

  /** Switch the model at runtime without recreating the agent instance. */
  setModel(model: string): void {
    this.config.model = model;
  }

  /** Change the permission mode at runtime. */
  setPermissionMode(mode: PermissionMode): void {
    this.config.permissionMode = mode;
    setSkipDangerousCheck(mode === 'auto');
  }

  /** Get the current permission mode. */
  getPermissionMode(): PermissionMode {
    return this.config.permissionMode;
  }

  /** Update the command allowlist and sync to runCommandTool. */
  setAllowlist(list: string[]): void {
    this.config.autoAllowlist = list;
    setCommandAllowlist(list);
  }

  /** Serialize conversation history to a JSON file. */
  saveSession(path: string): void {
    writeFileSync(path, JSON.stringify(this.messages, null, 2), 'utf-8');
  }

  /**
   * Load conversation history from a JSON file.
   * If the file does not exist, clears history silently.
   */
  loadSession(path: string): void {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      this.messages = JSON.parse(raw);
    } else {
      this.messages = [];
    }
  }

  // ── Send (streaming + automatic tool execution) ────────────────────────────

  /**
   * Send a message and stream the response.
   * Handles tool calls automatically (up to maxToolRounds).
   */
  async send(content: string): Promise<string> {
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;
    this.consecutiveErrors = 0;

    const userMessage: ChatCompletionMessageParam = {
      role: 'user',
      content,
    };
    this.messages.push(userMessage);
    this.emit('message:user', { role: 'user', content });
    this.emit('thinking:start');

    try {
      const fullText = await this.runLoop();
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    } finally {
      this.busy = false;
      this.emit('thinking:end');
    }
  }

  // ── Send (non-streaming, simpler) ─────────────────────────────────────────

  async sendSync(content: string): Promise<string> {
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;
    this.consecutiveErrors = 0;

    const userMessage: ChatCompletionMessageParam = {
      role: 'user',
      content,
    };
    this.messages.push(userMessage);
    this.emit('message:user', { role: 'user', content });

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
  }

  // ── Core loop ──────────────────────────────────────────────────────────────

  /**
   * Run the agent loop: call model → stream → execute tools → repeat.
   * `sync` mode skips streaming and uses non-streaming API.
   */
  private async runLoop(sync = false): Promise<string> {
    // Filter tools based on permission mode
    let activeTools = this.config.tools;
    if (this.config.permissionMode === 'readonly') {
      activeTools = this.config.tools.filter(t => t.readonly === true);
    }
    const tools: ChatCompletionTool[] = activeTools.map(toolToOpenAI);

    let fullText = '';

    for (let round = 0; round < this.config.maxToolRounds; round++) {
      // Break early if too many consecutive tool errors
      if (this.consecutiveErrors >= 3) {
        this.consecutiveErrors = 0;
        break;
      }

      // Build the message list with system prompt
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: this.config.instructions },
        ...this.messages,
      ];

      // Evict old messages if context window is getting full
      if (this.config.maxContextTokens > 0) {
        const evicted = evictMessages(messages, this.config.maxContextTokens);
        if (evicted.length < messages.length) {
          this.messages = evicted.length > 1 ? evicted.slice(1) : [];
        }
      }

      if (sync) {
        // ── Non-streaming call ─────────────────────────────────────────────
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          stream: false,
        });

        const choice = response.choices[0];
        if (!choice) break;

        const msg = choice.message;

        // Handle reasoning content (DeepSeek-specific)
        if (hasReasoning(msg)) {
          this.emit('reasoning:delta', msg.reasoning_content);
        }

        if (msg.content) {
          fullText += msg.content;
        }

        // Handle tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const functionCalls = msg.tool_calls.filter(isFunctionToolCall);
          if (functionCalls.length > 0) {
            this.emit('stream:delta', msg.content || '', fullText);
            // Push assistant message with tool calls before executing tools
            this.messages.push({
              role: 'assistant',
              content: msg.content || null,
              tool_calls: msg.tool_calls,
            });
            await this.executeToolCalls(functionCalls);
            continue;
          }
        }

        // No tool calls → done
        this.emit('stream:end', fullText);
        const assistantMsg: ChatCompletionMessageParam = {
          role: 'assistant',
          content: msg.content,
        };
        this.messages.push(assistantMsg);
        this.emit('message:assistant', { role: 'assistant', content: fullText });
        return fullText;
      } else {
        // ── Streaming call ─────────────────────────────────────────────────
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          stream: true,
        });

        // Accumulate tool calls across chunks by index
        const toolCallAccumulators = new Map<
          number,
          { id: string; name: string; arguments: string }
        >();
        let streamingContent = fullText;
        let finished = false;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          const finishReason = chunk.choices[0]?.finish_reason;

          if (!delta) continue;

          // Text content
          if (delta.content) {
            streamingContent += delta.content;
            this.emit('stream:delta', delta.content, streamingContent);
          }

          // DeepSeek-specific: reasoning_content in delta
          if (hasReasoning(delta)) {
            this.emit('reasoning:delta', delta.reasoning_content);
          }

          // Tool calls (accumulate by index — Delta.ToolCall has function)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulators.has(idx)) {
                toolCallAccumulators.set(idx, {
                  id: '',
                  name: '',
                  arguments: '',
                });
              }
              const acc = toolCallAccumulators.get(idx)!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            }
          }

          if (finishReason === 'tool_calls' || finishReason === 'stop' || finishReason === 'length') {
            if (toolCallAccumulators.size > 0) {
              // Add assistant message with tool calls to history
              const assistantMsg: ChatCompletionMessageParam = {
                role: 'assistant',
                content: streamingContent.slice(fullText.length) || null,
                tool_calls: Array.from(toolCallAccumulators.entries()).map(([, acc]) => ({
                  id: acc.id,
                  type: 'function' as const,
                  function: { name: acc.name, arguments: acc.arguments },
                })),
              };
              this.messages.push(assistantMsg);
              fullText = streamingContent;

              // All accumulated calls are 'function' type (checked during accumulation)
              const accumulatedCalls: ChatCompletionMessageFunctionToolCall[] =
                Array.from(toolCallAccumulators.entries()).map(([, acc]) => ({
                  id: acc.id,
                  type: 'function' as const,
                  function: { name: acc.name, arguments: acc.arguments },
                }));
              await this.executeToolCalls(accumulatedCalls);

              // If the response was truncated, warn the model
              if (finishReason === 'length') {
                this.messages.push({
                  role: 'tool',
                  tool_call_id: toolCallAccumulators.values().next().value?.id || 'n/a',
                  content: JSON.stringify({
                    warning: 'Response was truncated due to context length limit. Tool calls may have been cut off.',
                  }),
                });
              }

              finished = true;
            }
            break; // exit for-await loop
          }
        }

        if (!finished) {
          // No tool calls — assistant is done
          fullText = streamingContent;
          this.emit('stream:end', fullText);
          this.messages.push({ role: 'assistant', content: streamingContent });
          this.emit('message:assistant', {
            role: 'assistant',
            content: fullText,
          });
          return fullText;
        }
        // Continue the loop for the next round (tool results were added)
      }
    }

    // Max rounds reached
    this.emit('stream:end', fullText);
    if (fullText) {
      this.messages.push({ role: 'assistant', content: fullText });
      this.emit('message:assistant', { role: 'assistant', content: fullText });
    }
    return fullText;
  }

  /**
   * Execute the tool calls from a model response, add results to history.
   */
  private async executeToolCalls(
    toolCalls: ChatCompletionMessageFunctionToolCall[]
  ): Promise<void> {
    for (const tc of toolCalls) {
      const tool = this.toolsByName.get(tc.function.name);
      if (!tool) {
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `Unknown tool: ${tc.function.name}`,
          }),
        });
        continue;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      this.emit('tool:call', tc.function.name, args);
      try {
        const result = await tool.execute(args);
        this.consecutiveErrors = 0;
        this.emit('tool:result', tc.function.name, result);
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        this.consecutiveErrors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.emit('error', new Error(`Tool ${tc.function.name} failed: ${errMsg}`));
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `Tool execution failed: ${errMsg}`,
          }),
        });
      }
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMacOSAgent(config: MacOSAgentConfig): MacOSAgent {
  return new MacOSAgent(config);
}
