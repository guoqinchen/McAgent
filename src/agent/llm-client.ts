/**
 * LLMClient — wraps OpenAI SDK calls with error recovery and metrics.
 *
 * Extracted from MacOSAgent.runLoop() to separate the API-call concern
 * from the agent-loop orchestration.
 */

import type OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { errorRecoveryEngine } from '../engine/error-recovery-engine.js';

export type ThinkingBody = {
  thinking?: { type: 'enabled' };
  reasoning_effort: 'high' | 'max';
} | {
  reasoning_effort: 'high' | 'max';
};

export class LLMClient {
  constructor(private client: OpenAI) {}

  /**
   * Create a non-streaming (sync) completion.
   * Returns the response object, or undefined if recovery exhausted.
   */
  async createSync(
    model: string,
    messages: unknown[],
    tools: ChatCompletionTool[],
    thinkingBody: ThinkingBody,
    signal?: AbortSignal,
  ): Promise<any | undefined> {
    return errorRecoveryEngine.executeWithRecovery(
      () =>
        (this.client.chat.completions.create as any)({
          model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          extra_body: thinkingBody,
          stream: false,
          signal,
        }),
      'chat.completions.create',
    );
  }

  /**
   * Create a streaming completion.
   * Returns a stream (async iterable), or undefined if recovery exhausted.
   */
  async createStream(
    model: string,
    messages: unknown[],
    tools: ChatCompletionTool[],
    thinkingBody: ThinkingBody,
    signal?: AbortSignal,
  ): Promise<any | undefined> {
    return errorRecoveryEngine.executeWithRecovery(
      () =>
        (this.client.chat.completions.create as any)({
          model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          extra_body: thinkingBody,
          stream: true,
          signal,
        }),
      'chat.completions.create',
    );
  }
}
