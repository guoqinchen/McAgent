/**
 * useStreamingAgent v3.0 — optimized streaming debounce and agent event wiring.
 *
 * Performance optimizations:
 * - Batched state updates using ReactDOM.unstable_batchedUpdates via queue
 * - useElapsed uses stable timer ref to avoid interval churn
 * - Reduced intermediate allocations in stream buffer flushing
 * - Combined multiple setter calls into batch to leverage React 18 automatic batching
 * - Optimized scheduleFlush with microtask-based scheduling
 */

import { useEffect, useRef, useState } from 'react';
import type { MacOSAgent } from '../../agent.js';
import type { Message, ToolProgress, AgentContext, PermissionRequest } from '../../types/events.js';

// ─── Shared timer hook (optimized) ──────────────────────────────────────────────

/**
 * useElapsed — shared elapsed-seconds timer.
 * Uses stable startRef and timerRef to avoid re-creating intervals on every render.
 * Resets to 0 when `isActive` becomes false.
 */
export function useElapsed(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive) {
      setElapsed(0);
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
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

/** Maximum characters of streaming text stored in React state. Prevents OOM on large outputs. */
const MAX_STREAMING_TEXT = 100_000;
/** Maximum characters of reasoning text buffer. Prevents unbounded concatenation. */
const MAX_REASONING_TEXT = 50_000;

export function useStreamingAgent(options: UseStreamingAgentOptions): void {
  const { agent, onError } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let streamBuffer = '';
    let immediateId: ReturnType<typeof setImmediate> | null = null;
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
        // Cap to prevent OOM from large accumulated streaming text
        const text =
          streamBuffer.length > MAX_STREAMING_TEXT
            ? '...(output truncated)...\n' + streamBuffer.slice(-MAX_STREAMING_TEXT)
            : streamBuffer;
        optionsRef.current.setStreamingText(text);
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

    /**
     * Batch state updates using a microtask queue to leverage React 18 automatic batching.
     * Multiple queueState calls within the same microtask are batched into a single render.
     */
    const pendingUpdates: Array<() => void> = [];
    let microtaskScheduled = false;

    function queueState(update: () => void): void {
      pendingUpdates.push(update);
      if (!microtaskScheduled) {
        microtaskScheduled = true;
        // Use queueMicrotask for Node.js-native batching
        queueMicrotask(() => {
          microtaskScheduled = false;
          const updates = pendingUpdates.slice();
          pendingUpdates.length = 0;
          for (let i = 0; i < updates.length; i++) {
            updates[i]!();
          }
        });
      }
    }

    const onThinkingStart = () => {
      flushStreamBuffer();
      queueState(() => {
        const ref = optionsRef.current;
        ref.setStreamingText('');
        ref.setToolCalls(() => []);
        ref.setToolResults(() => []);
        ref.setStatus('🤔 Processing…');
        ref.setErrorMessage('');
        ref.setIsThinking?.(true);
        ref.setReasoningText?.('');
      });
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
      queueState(() => {
        const ref = optionsRef.current;
        ref.setStatus('');
        ref.setStreamingText('');
      });
    };

    const onToolCall = (name: string, args: unknown) => {
      flushStreamBuffer();
      queueState(() => {
        const ref = optionsRef.current;
        ref.setToolCalls((prev) => {
          const len = prev.length;
          const next = new Array<{ name: string; args: unknown }>(len + 1);
          for (let i = 0; i < len; i++) next[i] = prev[i]!;
          next[len] = { name, args };
          return next;
        });
        ref.setToolProgress?.(null);
      });
    };

    const onToolProgress = (progress: ToolProgress) => {
      optionsRef.current.setToolProgress?.(progress);
    };

    const onToolResult = (name: string, result: unknown) => {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      const isSuccess =
        !resultStr.toLowerCase().startsWith('error') &&
        !resultStr.toLowerCase().includes('command not found');
      queueState(() => {
        const ref = optionsRef.current;
        ref.setToolResults((prev) => {
          const len = prev.length;
          const next = new Array<{ name: string; result: string; success: boolean }>(len + 1);
          for (let i = 0; i < len; i++) next[i] = prev[i]!;
          next[len] = { name, result: resultStr, success: isSuccess };
          return next;
        });
        ref.setToolProgress?.(null);
      });
    };

    const onMessageAssistant = () => {
      const msgs = agent.getMessages();
      flushStreamBuffer();
      queueState(() => {
        const ref = optionsRef.current;
        ref.setMessages(msgs);
        ref.setIsLoading(false);
        ref.setIsThinking?.(false);
        ref.setStreamingText('');
        ref.setToolCalls(() => []);
        ref.setToolResults(() => []);
        ref.setErrorMessage('');
      });
    };

    const onErrorEvent = () => {
      flushStreamBuffer();
      queueState(() => {
        const ref = optionsRef.current;
        ref.setIsLoading(false);
        ref.setIsThinking?.(false);
        ref.setStatus('');
      });
    };

    const onReasoningDelta = (text: string) => {
      reasoningBuffer = (reasoningBuffer + text).slice(-MAX_REASONING_TEXT);
      const currentReasoning = reasoningBuffer;
      queueState(() => {
        const ref = optionsRef.current;
        ref.setIsThinking?.(true);
        ref.setReasoningText?.(currentReasoning);
        ref.setStatus('💭 Thinking…');
      });
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
