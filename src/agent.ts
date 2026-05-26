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
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageFunctionToolCall,
} from 'openai/resources/chat/completions';
import { EventEmitter } from 'eventemitter3';
import { setCommandAllowlist, setSkipDangerousCheck } from './tools.js';
import { ConversationHistory } from './agent/conversation.js';
import { LLMClient } from './agent/llm-client.js';
import { ToolExecutor } from './agent/tool-executor.js';
import { DEFAULT_MAX_CONTEXT_TOKENS } from './context-manager.js';
import { logger } from './logging/structured-logger.js';
import { metricsCollector } from './monitoring/metrics-collector.js';

// ─── Internal type imports ─────────────────────────────────────────────────

import type { Tool } from './types/tool.js';
import type { McAgentConfig as MacOSAgentConfig, PermissionMode } from './types/config.js';
import type { Message, McAgentEvents as MacOSAgentEvents } from './types/events.js';

// ─── Re-export types for backward compatibility ────────────────────────────

export type { Tool } from './types/tool.js';
export type { McAgentConfig as MacOSAgentConfig, PermissionMode } from './types/config.js';
export type { Message, McAgentEvents as MacOSAgentEvents } from './types/events.js';

// The class uses the original names via the imported bindings
// (McAgentConfig → MacOSAgentConfig, McAgentEvents → MacOSAgentEvents)

let enableStrictMode = false;

export function setToolStrictMode(strict: boolean): void {
  enableStrictMode = strict;
}

function toolToOpenAI(t: Tool): ChatCompletionTool {
  const tool: ChatCompletionTool = {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  };
  // Strict mode (Beta): model output strictly follows JSON Schema
  if (enableStrictMode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool.function as any).strict = true;
  }
  return tool;
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

// ─── Defaults ────────────────────────────────────────────────────────────────
// DeepSeek-V4: https://api-docs.deepseek.com/zh-cn/

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'; // OpenAI-compatible
const DEEPSEEK_BETA_URL = 'https://api.deepseek.com/beta'; // Beta features (strict mode)
const DEEPSEEK_MODEL = 'deepseek-v4-flash'; // Default: fast/economical

// ─── Agent class ─────────────────────────────────────────────────────────────

/**
 * McAgent — standalone macOS AI agent using DeepSeek.
 *
 * Emits typed events so any UI (Ink TUI, HTTP, Discord) can subscribe
 * without coupling to the agent internals.
 */
export class MacOSAgent extends EventEmitter<MacOSAgentEvents> {
  private client: OpenAIClient;
  private conversation = new ConversationHistory();
  private config: Required<Omit<MacOSAgentConfig, 'apiKey' | 'baseURL'>> & {
    apiKey: string;
    baseURL: string;
    maxContextTokens: number;
    permissionMode: PermissionMode;
    autoAllowlist: string[];
    thinkingEnabled: boolean;
    reasoningEffort: 'high' | 'max';
    toolStrictMode: boolean;
    useBetaEndpoint: boolean;
  };
  private toolsByName = new Map<string, Tool>();
  private llmClient: LLMClient;
  private toolExecutor: ToolExecutor;
  /** Prevents concurrent send()/sendSync() calls from interleaving message history */
  private busy = false;
  /** Count of consecutive tool execution failures in the current send() call */
  private consecutiveErrors = 0;
  /** Whether dispose() has been called; prevents further use. */
  private disposed = false;

  constructor(config: MacOSAgentConfig) {
    super();

    // Resolve base URL: beta endpoint for strict mode, otherwise custom or default
    const baseURL =
      config.baseURL ?? (config.useBetaEndpoint ? DEEPSEEK_BETA_URL : DEEPSEEK_BASE_URL);
    const model = config.model ?? DEEPSEEK_MODEL;
    const thinkingEnabled = config.thinkingEnabled ?? true;

    this.config = {
      apiKey: config.apiKey,
      baseURL,
      model,
      instructions:
        config.instructions ??
        `You are a macOS expert assistant running DeepSeek-V4. ` +
          `Help the user operate their Mac efficiently using CLI commands, ` +
          `system utilities, and automation. When the user asks you to do ` +
          `something, use the available tools to execute commands, inspect ` +
          `the system, and provide clear explanations. Always explain what ` +
          `a command will do before running it, especially commands that ` +
          `modify the system. Prefer safe, read-only operations unless the ` +
          `user explicitly asks for changes.`,
      tools: config.tools ?? [],
      maxToolRounds: config.maxToolRounds ?? 10,
      maxContextTokens: config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      permissionMode: config.permissionMode ?? 'approve',
      autoAllowlist: config.autoAllowlist ?? [
        'git',
        'npm',
        'brew',
        'ls',
        'cat',
        'echo',
        'mkdir',
        'touch',
      ],
      thinkingEnabled,
      reasoningEffort: config.reasoningEffort ?? (thinkingEnabled ? 'high' : 'max'),
      toolStrictMode: config.toolStrictMode ?? false,
      useBetaEndpoint: config.useBetaEndpoint ?? false,
    };

    // Sync allowlist, mode, and strict mode to tools module
    setCommandAllowlist(this.config.autoAllowlist);
    setSkipDangerousCheck(this.config.permissionMode === 'auto');
    setToolStrictMode(this.config.toolStrictMode);

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: 60_000, // 60s — prevent indefinite hang on API calls
      maxRetries: 1, // single retry to avoid long retry chains
    });

    this.llmClient = new LLMClient(this.client);
    this.toolExecutor = new ToolExecutor(this.toolsByName);

    logger.info('McAgent initialized', {
      model: this.config.model,
      baseURL: this.config.baseURL,
      tools: this.config.tools.length,
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
    return this.conversation.toPlainMessages();
  }

  /** Clear all conversation history. */
  clearHistory(): void {
    this.conversation.clear();
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
  async saveSession(path: string): Promise<void> {
    await this.conversation.save(path);
  }

  /**
   * Load conversation history from a JSON file.
   * If the file does not exist, clears history silently.
   */
  async loadSession(path: string): Promise<void> {
    await this.conversation.load(path);
  }

  /**
   * Release all resources. After calling this, the agent must not be used again.
   * Removes all event listeners and marks the instance as disposed.
   */
  dispose(): void {
    this.disposed = true;
    this.removeAllListeners();
    logger.info('Agent disposed');
  }

  // ── Send (streaming + automatic tool execution) ────────────────────────────

  /**
   * Send a message and stream the response.
   * Handles tool calls automatically (up to maxToolRounds).
   */
  async send(content: string, signal?: AbortSignal): Promise<string> {
    if (this.disposed) throw new Error('Agent has been disposed');
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;
    this.consecutiveErrors = 0;
    const requestId = `send-${Date.now()}`;
    metricsCollector.startRequest(requestId);

    this.conversation.addUserMessage(content);
    this.emit('message:user', { role: 'user', content });
    this.emit('thinking:start');
    logger.info('send() started', { content: content.slice(0, 80) });

    try {
      const fullText = await this.runLoop(false, signal);
      metricsCollector.endRequest(requestId, true, undefined, {
        prompt: 0,
        completion: fullText.length,
      });
      logger.info('send() completed', { responseLen: fullText.length });
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      metricsCollector.endRequest(requestId, false, 'error');
      logger.error('send() failed', error);
      this.emit('error', error);
      throw error;
    } finally {
      this.busy = false;
      this.emit('thinking:end');
    }
  }

  // ── Send (non-streaming, simpler) ─────────────────────────────────────────

  async sendSync(content: string, signal?: AbortSignal): Promise<string> {
    if (this.disposed) throw new Error('Agent has been disposed');
    if (this.busy) {
      throw new Error('Agent is already processing a request');
    }
    this.busy = true;
    this.consecutiveErrors = 0;
    const requestId = `sendSync-${Date.now()}`;
    metricsCollector.startRequest(requestId);

    this.conversation.addUserMessage(content);
    this.emit('message:user', { role: 'user', content });
    logger.info('sendSync() started', { content: content.slice(0, 80) });

    try {
      const fullText = await this.runLoop(true, signal);
      metricsCollector.endRequest(requestId, true, undefined, {
        prompt: 0,
        completion: fullText.length,
      });
      logger.info('sendSync() completed', { responseLen: fullText.length });
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      metricsCollector.endRequest(requestId, false, 'error');
      logger.error('sendSync() failed', error);
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
  private async runLoop(sync = false, signal?: AbortSignal): Promise<string> {
    // Filter tools based on permission mode
    let activeTools = this.config.tools;
    if (this.config.permissionMode === 'readonly') {
      activeTools = this.config.tools.filter((t) => t.readonly === true);
    }
    const tools: ChatCompletionTool[] = activeTools.map(toolToOpenAI);

    let fullText = '';

    for (let round = 0; round < this.config.maxToolRounds; round++) {
      // Break early if too many consecutive tool errors
      if (this.consecutiveErrors >= 3) {
        logger.warn('runLoop: breaking due to too many consecutive errors');
        this.consecutiveErrors = 0;
        break;
      }

      if (round === this.config.maxToolRounds - 1) {
        logger.warn('runLoop: reached maxToolRounds', { max: this.config.maxToolRounds });
      }

      // Build messages with system prompt + auto-eviction
      const messages = this.conversation.getMessagesWithSystem(
        this.config.instructions,
        this.config.maxContextTokens
      );

      // Build common API params with thinking mode
      // DeepSeek-V4: thinking + reasoning_effort via extra_body (OpenAI SDK compat)
      const thinkingBody = this.config.thinkingEnabled
        ? { thinking: { type: 'enabled' as const }, reasoning_effort: this.config.reasoningEffort }
        : { reasoning_effort: this.config.reasoningEffort };

      if (sync) {
        // ── Non-streaming call ─────────────────────────────────────────────
        const response = await this.llmClient.createSync(
          this.config.model,
          messages,
          tools,
          thinkingBody,
          signal
        );
        if (!response) break;

        const choice = response.choices[0];
        if (!choice) break;

        const msg = choice.message;
        let reasoningContent = '';

        // Handle reasoning content (DeepSeek-specific)
        if (hasReasoning(msg)) {
          reasoningContent = msg.reasoning_content;
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
            this.conversation.addAssistantMessage(
              msg.content ?? null,
              msg.tool_calls,
              reasoningContent
            );
            await this.executeToolCalls(functionCalls);
            continue;
          }
        }

        // No tool calls → done
        this.emit('stream:end', fullText);
        this.conversation.addAssistantMessage(msg.content, undefined, reasoningContent);
        this.emit('message:assistant', { role: 'assistant', content: fullText });
        return fullText;
      } else {
        // ── Streaming call ─────────────────────────────────────────────────
        // OpenAI SDK timeout (60s, set in constructor) already guards against
        // streaming hangs. No separate AbortSignal needed — the SDK's
        // internal timeout handles abort.
        const stream = await this.llmClient.createStream(
          this.config.model,
          messages,
          tools,
          thinkingBody,
          signal
        );
        if (!stream) break;

        // Accumulate tool calls across chunks by index
        const toolCallAccumulators = new Map<
          number,
          { id: string; name: string; arguments: string }
        >();
        let streamingContent = fullText;
        let reasoningContent = '';
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
            reasoningContent += delta.reasoning_content;
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

          if (
            finishReason === 'tool_calls' ||
            finishReason === 'stop' ||
            finishReason === 'length'
          ) {
            if (toolCallAccumulators.size > 0) {
              // Add assistant message with tool calls to history
              this.conversation.addAssistantMessage(
                streamingContent.slice(fullText.length) || null,
                Array.from(toolCallAccumulators.entries()).map(([, acc]) => ({
                  id: acc.id,
                  type: 'function' as const,
                  function: { name: acc.name, arguments: acc.arguments },
                })),
                reasoningContent
              );
              fullText = streamingContent;

              // All accumulated calls are 'function' type (checked during accumulation)
              const accumulatedCalls: ChatCompletionMessageFunctionToolCall[] = Array.from(
                toolCallAccumulators.entries()
              ).map(([, acc]) => ({
                id: acc.id,
                type: 'function' as const,
                function: { name: acc.name, arguments: acc.arguments },
              }));
              await this.executeToolCalls(accumulatedCalls);

              // If the response was truncated, warn the model
              if (finishReason === 'length') {
                this.conversation.addToolWarning(
                  toolCallAccumulators.values().next().value?.id || 'n/a',
                  'Response was truncated due to context length limit. Tool calls may have been cut off.'
                );
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
          this.conversation.addAssistantMessage(streamingContent, undefined, reasoningContent);
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
      this.conversation.addAssistantMessage(fullText);
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
    const results = await this.toolExecutor.executeAll(
      toolCalls,
      // onCall
      (name, args) => this.emit('tool:call', name, args),
      // onResult
      (name, result) => {
        this.consecutiveErrors = 0;
        this.emit('tool:result', name, result);
      },
      // onError
      (error) => {
        this.consecutiveErrors++;
        this.emit('error', error);
      }
    );

    // Inject all results into conversation history
    for (const r of results) {
      this.conversation.addToolResult(r.toolCallId, r.content);
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMacOSAgent(config: MacOSAgentConfig): MacOSAgent {
  return new MacOSAgent(config);
}
