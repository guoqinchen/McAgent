/**
 * LLMClient — wraps OpenAI SDK calls with error recovery and metrics.
 *
 * Extracted from MacOSAgent.runLoop() to separate the API-call concern
 * from the agent-loop orchestration.
 */

import type OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { errorRecoveryEngine } from '../engine/error-recovery-engine.js';
import type { CompletionResponse, CompletionStream } from '../types/llm-provider.js';

export type ThinkingBody =
  | {
      thinking?: { type: 'enabled' };
      reasoning_effort: 'high' | 'max';
    }
  | {
      reasoning_effort: 'high' | 'max';
    };

/**
 * Parameters passed to the OpenAI chat.completion.create.
 * Extended with `extra_body` for DeepSeek-specific options (thinking mode).
 */
interface CreateCompletionParams {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  extra_body: ThinkingBody;
  stream: boolean;
  signal?: AbortSignal;
}

export class LLMClient {
  constructor(private client: OpenAI) {}

  /**
   * Create a non-streaming (sync) completion.
   * Returns the response object, or null if recovery exhausted.
   */
  async createSync(
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    thinkingBody: ThinkingBody,
    signal?: AbortSignal
  ): Promise<CompletionResponse | null> {
    const params: CreateCompletionParams = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      extra_body: thinkingBody,
      stream: false,
      signal,
    };
    // `extra_body` is an undocumented OpenAI SDK extension for provider-specific
    // options (DeepSeek thinking mode). The SDK accepts it at runtime but its
    // TypeScript types don't declare it. We cast narrowly here, confined to this
    // one call, rather than using `as any` on the whole params object.
    return errorRecoveryEngine.executeWithRecovery(
      () => this.client.chat.completions.create(params),
      'chat.completions.create'
    ) as Promise<CompletionResponse | null>;
  }

  /**
   * Create a streaming completion.
   * Returns a stream (async iterable), or null if recovery exhausted.
   */
  async createStream(
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    thinkingBody: ThinkingBody,
    signal?: AbortSignal
  ): Promise<CompletionStream | null> {
    const params: CreateCompletionParams = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      extra_body: thinkingBody,
      stream: true,
      signal,
    };
    return errorRecoveryEngine.executeWithRecovery(
      () => this.client.chat.completions.create(params),
      'chat.completions.create'
    ) as Promise<CompletionStream | null>;
  }
}
