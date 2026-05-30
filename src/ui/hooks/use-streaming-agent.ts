/**
 * useStreamingAgent — encapsulates streaming debounce and agent event wiring.
 *
 * Extracted from cli.tsx to keep the TUI component focused on rendering.
 * Buffers rapid token-by-token emits into ~60fps React state updates to
 * prevent terminal stuttering from per-token re-renders.
 *
 * v2.3: Added tool progress tracking, context updates, and permission requests.
 */

import { useEffect, useRef } from 'react';
import type { MacOSAgent } from '../../agent.js';
import type {
  Message,
  ToolProgress,
  AgentContext,
  PermissionRequest,
} from '../../types/events.js';

export interface UseStreamingAgentOptions {
  agent: MacOSAgent;
  setStreamingText: (text: string) => void;
  setToolCalls: (
    updater: (
      prev: Array<{ name: string; args: unknown }>
    ) => Array<{ name: string; args: unknown }>
  ) => void;
  setToolResults: (
    updater: (
      prev: Array<{ name: string; result: string; success: boolean }>
    ) => Array<{ name: string; result: string; success: boolean }>
  ) => void;
  setStatus: (status: string) => void;
  setErrorMessage: (message: string) => void;
  setMessages: (messages: Message[]) => void;
  setIsLoading: (loading: boolean) => void;
  /** Whether agent is in thinking phase */
  setIsThinking?: (thinking: boolean) => void;
  /** Reasoning text from DeepSeek reasoning_content */
  setReasoningText?: (text: string) => void;
  onError?: (err: Error) => void;
  /** Called after each frame update with frame interval in ms. Use for perf monitoring. */
  onFrame?: (frameIntervalMs: number) => void;
}

const WRITE_INTERVAL_MS = 16; // ≈ 60 fps

export function useStreamingAgent(options: UseStreamingAgentOptions): void {
  const { agent, onError } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let streamBuffer = '';
    let streamFlushTimer: ReturnType<typeof setInterval> | null = null;

    function flushStreamBuffer() {
      if (streamFlushTimer !== null) {
        clearInterval(streamFlushTimer);
        streamFlushTimer = null;
      }
      if (streamBuffer.length > 0) {
        optionsRef.current.setStreamingText(streamBuffer);
      }
      streamBuffer = '';
    }

    let reasoningBuffer = '';

    const onThinkingStart = () => {
      flushStreamBuffer();
      optionsRef.current.setStreamingText('');
      optionsRef.current.setToolCalls(() => []);
      optionsRef.current.setToolResults(() => []);
      optionsRef.current.setStatus('🤔 Processing…');
      optionsRef.current.setErrorMessage('');
      optionsRef.current.setIsThinking?.(true);
      optionsRef.current.setReasoningText?.('');
      reasoningBuffer = '';
    };

    const onStreamDelta = (_delta: string, accumulated: string) => {
      // Streaming started, thinking is done
      optionsRef.current.setIsThinking?.(false);
      streamBuffer = accumulated;
      if (!streamFlushTimer) {
        let lastFrameTime = performance.now();
        streamFlushTimer = setInterval(() => {
          const now = performance.now();
          const frameInterval = now - lastFrameTime;
          lastFrameTime = now;
          optionsRef.current.onFrame?.(frameInterval);
          if (streamBuffer.length > 0) {
            optionsRef.current.setStreamingText(streamBuffer);
          }
        }, WRITE_INTERVAL_MS);
      }
    };

    const onStreamEnd = (_fullText: string) => {
      flushStreamBuffer();
      optionsRef.current.setStatus('');
      optionsRef.current.setStreamingText('');
    };

    const onToolCall = (name: string, args: unknown) => {
      flushStreamBuffer();
      optionsRef.current.setToolCalls((prev) => [...prev, { name, args }]);
      optionsRef.current.setToolProgress?.(null);
    };

    const onToolProgress = (progress: ToolProgress) => {
      optionsRef.current.setToolProgress?.(progress);
    };

    const onToolResult = (name: string, result: unknown) => {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      const isSuccess =
        !resultStr.toLowerCase().startsWith('error') &&
        !resultStr.toLowerCase().includes('command not found');
      optionsRef.current.setToolResults((prev) => [
        ...prev,
        { name, result: resultStr, success: isSuccess },
      ]);
      optionsRef.current.setToolProgress?.(null);
    };

    const onMessageAssistant = () => {
      flushStreamBuffer();
      optionsRef.current.setMessages(agent.getMessages());
      optionsRef.current.setIsLoading(false);
      optionsRef.current.setIsThinking?.(false);
      optionsRef.current.setStreamingText('');
      optionsRef.current.setToolCalls(() => []);
      optionsRef.current.setToolResults(() => []);
      optionsRef.current.setErrorMessage('');
    };

    const onErrorEvent = () => {
      flushStreamBuffer();
      optionsRef.current.setIsLoading(false);
      optionsRef.current.setIsThinking?.(false);
      optionsRef.current.setStatus('');
    };

    const onReasoningDelta = (text: string) => {
      optionsRef.current.setIsThinking?.(true);
      // Accumulate reasoning text across deltas (DeepSeek sends reasoning_content per token)
      reasoningBuffer = reasoningBuffer + text;
      optionsRef.current.setReasoningText?.(reasoningBuffer);
      optionsRef.current.setStatus('💭 Thinking…');
    };

    const onContextUpdate = (context: AgentContext) => {
      optionsRef.current.setAgentContext?.(context);
    };

    const onPermissionRequest = (request: PermissionRequest) => {
      optionsRef.current.setPermissionRequest?.(request);
    };

    agent.on('thinking:start', onThinkingStart);
    agent.on('stream:delta', onStreamDelta);
    agent.on('stream:end', onStreamEnd);
    agent.on('tool:call', onToolCall);
    agent.on('tool:progress', onToolProgress);
    agent.on('tool:result', onToolResult);
    agent.on('message:assistant', onMessageAssistant);
    agent.on('error', onErrorEvent);
    agent.on('reasoning:delta', onReasoningDelta);
    agent.on('context:update', onContextUpdate);
    agent.on('permission:request', onPermissionRequest);

    const onErrorWithLog = (err: Error) => {
      optionsRef.current.setErrorMessage(err.message);
      onErrorEvent();
      onError?.(err);
    };
    agent.off('error', onErrorEvent);
    agent.on('error', onErrorWithLog);

    return () => {
      flushStreamBuffer();
      agent.off('thinking:start', onThinkingStart);
      agent.off('stream:delta', onStreamDelta);
      agent.off('stream:end', onStreamEnd);
      agent.off('tool:call', onToolCall);
      agent.off('tool:progress', onToolProgress);
      agent.off('tool:result', onToolResult);
      agent.off('message:assistant', onMessageAssistant);
      agent.off('error', onErrorWithLog);
      agent.off('reasoning:delta', onReasoningDelta);
      agent.off('context:update', onContextUpdate);
      agent.off('permission:request', onPermissionRequest);
    };
  }, [agent]);
}
