/**
 * useStreamingAgent — encapsulates streaming debounce and agent event wiring.
 *
 * Extracted from cli.tsx to keep the TUI component focused on rendering.
 * Buffers rapid token-by-token emits into ~60fps React state updates to
 * prevent terminal stuttering from per-token re-renders.
 *
 * v2.4: Optimized with RAF-based scheduling for smoother streaming,
 *       reduced state update batching, and minimized intermediate allocations.
 */

import { useEffect, useRef, useState } from 'react';
import type { MacOSAgent } from '../../agent.js';
import type { Message, ToolProgress, AgentContext, PermissionRequest } from '../../types/events.js';

// ─── Shared timer hook ──────────────────────────────────────────────────────────

/**
 * useElapsed — shared elapsed-seconds timer.
 * Resets to 0 when `isActive` becomes false.
 */
export function useElapsed(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  return elapsed;
}

/**
 * Format elapsed seconds into a human-readable string.
 */
export function formatElapsed(elapsed: number): string {
  if (elapsed >= 60) {
    return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  }
  return `${elapsed}s`;
}

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
  /** Tool progress updates */
  setToolProgress?: (progress: ToolProgress | null) => void;
  /** Agent context updates (status bar) */
  setAgentContext?: (context: AgentContext) => void;
  /** Permission request overlay */
  setPermissionRequest?: (request: PermissionRequest | null) => void;
  onError?: (err: Error) => void;
  /** Called after each frame update with frame interval in ms. Use for perf monitoring. */
  onFrame?: (frameIntervalMs: number) => void;
}

/** Target frame budget: ~16ms for ~60fps updates. */
const FRAME_BUDGET_MS = 16;

export function useStreamingAgent(options: UseStreamingAgentOptions): void {
  const { agent, onError } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let streamBuffer = '';
    let immediateId: NodeJS.Immediate | null = null;
    let lastFrameTime = performance.now();
    let flushScheduled = false;

    function scheduleStreamFlush() {
      if (flushScheduled) return;
      flushScheduled = true;
      const now = performance.now();
      const elapsed = now - lastFrameTime;
      if (elapsed >= FRAME_BUDGET_MS) {
        doFlush();
      } else {
        // Use setImmediate as Node.js equivalent of requestAnimationFrame
        immediateId = setImmediate(() => {
          doFlush();
        });
      }
    }

    function doFlush() {
      flushScheduled = false;
      if (immediateId !== null) {
        clearImmediate(immediateId);
        immediateId = null;
      }
      if (streamBuffer.length > 0) {
        const now = performance.now();
        const frameInterval = now - lastFrameTime;
        lastFrameTime = now;
        optionsRef.current.onFrame?.(frameInterval);
        optionsRef.current.setStreamingText(streamBuffer);
      }
    }

    function flushStreamBuffer() {
      if (immediateId !== null) {
        clearImmediate(immediateId);
        immediateId = null;
      }
      flushScheduled = false;
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
      lastFrameTime = performance.now();
    };

    const onStreamDelta = (_delta: string, accumulated: string) => {
      // Streaming started, thinking is done
      optionsRef.current.setIsThinking?.(false);
      streamBuffer = accumulated;
      scheduleStreamFlush();
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
      reasoningBuffer = ''; // Free reasoning text buffer on unmount
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
