/**
 * LLM provider response types for McAgent.
 *
 * Provides proper TypeScript types for LLM completion responses,
 * replacing raw `any` usage in LLMClient.
 */

import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';

/** Non-streaming completion response. */
export type CompletionResponse = ChatCompletion;

/** Streaming completion response (async iterable of chunks). */
export type CompletionStream = AsyncIterable<ChatCompletionChunk>;
