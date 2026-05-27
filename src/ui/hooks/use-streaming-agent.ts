/**
 * useStreamingAgent — encapsulates streaming debounce and agent event wiring.
 *
 * Extracted from cli.tsx to keep the TUI component focused on rendering.
 * Buffers rapid token-by-token emits into ~60fps React state updates to
 * prevent terminal stuttering from per-token re-renders.
 */

import { useEffect, useRef } from 'react';
import type { MacOSAgent } from '../../agent.js';
import type { Message } from '../../types/events.js';

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

    const onThinkingStart = () => {
      flushStreamBuffer();
      optionsRef.current.setStreamingText('');
      optionsRef.current.setToolCalls(() => []);
      optionsRef.current.setToolResults(() => []);
      optionsRef.current.setStatus('🤔 Processing…');
      optionsRef.current.setErrorMessage('');
    };

    const onStreamDelta = (_delta: string, accumulated: string) => {
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
    };

    const onMessageAssistant = () => {
      flushStreamBuffer();
      optionsRef.current.setMessages(agent.getMessages());
      optionsRef.current.setIsLoading(false);
      optionsRef.current.setStreamingText('');
      optionsRef.current.setToolCalls(() => []);
      optionsRef.current.setToolResults(() => []);
      optionsRef.current.setErrorMessage('');
    };

    const onErrorEvent = () => {
      flushStreamBuffer();
      optionsRef.current.setIsLoading(false);
      optionsRef.current.setStatus('');
    };

    const onReasoningDelta = (_text: string) => {
      optionsRef.current.setStatus('💭 Thinking…');
    };

    agent.on('thinking:start', onThinkingStart);
    agent.on('stream:delta', onStreamDelta);
    agent.on('stream:end', onStreamEnd);
    agent.on('tool:call', onToolCall);
    agent.on('tool:result', onToolResult);
    agent.on('message:assistant', onMessageAssistant);
    agent.on('error', onErrorEvent);
    agent.on('reasoning:delta', onReasoningDelta);

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
      agent.off('tool:result', onToolResult);
      agent.off('message:assistant', onMessageAssistant);
      agent.off('error', onErrorWithLog);
      agent.off('reasoning:delta', onReasoningDelta);
    };
  }, [agent]);
}
