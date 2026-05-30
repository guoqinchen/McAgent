/**
 * MessageList — enhanced scrollable message view for Ink TUI.
 *
 * Renders chat messages with:
 * - Role-based visual hierarchy (colored badges, icons)
 * - Message separators
 * - Enhanced error display with recovery hints
 * - Integrated ThinkingIndicator, ToolVisualizer, StreamingText
 * - Scroll management with PageUp/PageDown
 * - Elapsed timer for loading states
 */

import { useEffect, useState, useMemo, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useScrollManager } from '../hooks/use-scroll-manager.js';
import { useTheme } from '../hooks/use-theme.js';
import { MarkdownRenderer } from './markdown-renderer.js';
import { ThinkingIndicator } from './thinking-indicator.js';
import { ToolVisualizer } from './tool-visualizer.js';
import { StreamingText } from './streaming-text.js';
import type { Message } from '../../types/events.js';
import type { ToolCallInfo } from './tool-visualizer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageListProps {
  messages: Message[];
  streamingText: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; result: string; success: boolean }>;
  status: string;
  errorMessage: string;
  isLoading: boolean;
  /** Whether the agent is in thinking state */
  isThinking?: boolean;
  /** Reasoning text from DeepSeek reasoning_content */
  reasoningText?: string;
  /** Viewport height in lines (default 10) */
  viewportHeight?: number;
}

// ─── Line estimation ──────────────────────────────────────────────────────────

function estimateLines(text: string, cols = 80): number {
  if (!text) return 0;
  const lines = text.split('\n');
  let total = 0;
  for (const line of lines) {
    total += Math.max(1, Math.ceil(line.length / cols));
  }
  return total;
}

// ─── Elapsed Timer ────────────────────────────────────────────────────────────

const ElapsedDisplay = memo(function ElapsedDisplay({
  isLoading,
  color,
}: {
  isLoading: boolean;
  color: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  if (!isLoading || elapsed === 0) return null;

  const elapsedStr =
    elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

  return <Text color={color}> ({elapsedStr})</Text>;
});

// ─── Message role badge ───────────────────────────────────────────────────────

const RoleBadge = memo(function RoleBadge({
  role,
}: {
  role: 'user' | 'assistant' | 'system';
}) {
  const theme = useTheme();

  switch (role) {
    case 'user':
      return (
        <Text bold color={theme.userLabel}>
          {'\u25b6'} You
        </Text>
      );
    case 'assistant':
      return (
        <Text bold color={theme.assistantLabel}>
          {'\u25c6'} Assistant
        </Text>
      );
    case 'system':
      return (
        <Text bold color={theme.systemLabel}>
          {'\u2699'} System
        </Text>
      );
  }
});

// ─── Message separator ────────────────────────────────────────────────────────

function MessageSeparator({ color }: { color: string }) {
  return (
    <Box>
      <Text color={color} dimColor>
        {'\u2500'.repeat(50)}
      </Text>
    </Box>
  );
}

// ─── Build tool calls with status ─────────────────────────────────────────────

function buildToolCallInfos(
  toolCalls: Array<{ name: string; args: unknown }>,
  toolResults: Array<{ name: string; result: string; success: boolean }>,
): ToolCallInfo[] {
  const resultMap = new Map<string, { result: string; success: boolean }>();
  for (const tr of toolResults) {
    resultMap.set(tr.name, { result: tr.result, success: tr.success });
  }

  const lastCallIdx = toolCalls.length - 1;

  return toolCalls.map((tc, i) => {
    const result = resultMap.get(tc.name);
    const isLastWithoutResult = i === lastCallIdx && !result;

    return {
      name: tc.name,
      args: tc.args,
      status: result
        ? (result.success ? 'success' : 'error')
        : isLastWithoutResult
          ? 'running'
          : 'pending',
      result: result?.result,
    } as ToolCallInfo;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MessageList({
  messages,
  streamingText,
  toolCalls,
  toolResults,
  toolProgress,
  status,
  errorMessage,
  isLoading,
  isThinking = false,
  reasoningText = '',
  viewportHeight = 10,
}: MessageListProps) {
  const scroll = useScrollManager();
  const theme = useTheme();
  const [cols] = useState(() => process.stdout.columns || 80);

  // Precompute line heights
  const msgHeights = useMemo(() => {
    const heights: number[] = [];
    for (const msg of messages) {
      heights.push(1 + estimateLines(msg.content, cols) + 1);
    }
    return heights;
  }, [messages, cols]);

  const streamingHeight = useMemo(() => {
    if (!streamingText) return 0;
    return 1 + estimateLines(streamingText, cols) + 2;
  }, [streamingText, cols]);

  // Compute total lines
  const totalLines = useMemo(() => {
    let total = 0;
    for (const h of msgHeights) total += h;
    if (streamingHeight) total += streamingHeight;
    total += toolCalls.length * 2;
    total += toolResults.length;
    if (isThinking) total += 3;
    if (status && !streamingText && !errorMessage && !isThinking) total += 1;
    if (errorMessage) total += 3;
    return total;
  }, [msgHeights, streamingHeight, toolCalls, toolResults, status, streamingText, errorMessage, isThinking]);

  // Error classification
  const errorHint = useMemo(() => {
    if (!errorMessage) return null;
    const lower = errorMessage.toLowerCase();
    if (lower.includes('fetch') || lower.includes('network') || lower.includes('connect') || lower.includes('econnrefused')) {
      return 'Check your network connection and API endpoint.';
    }
    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
      return 'Verify your DEEPSEEK_API_KEY is valid and set correctly.';
    }
    if (lower.includes('429') || lower.includes('rate limit')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'The request timed out. Try again or simplify your query.';
    }
    if (lower.includes('blocked') || lower.includes('dangerous')) {
      return 'This command was blocked for safety. Try a safer alternative.';
    }
    return 'Press Ctrl+L to clear the screen and try again.';
  }, [errorMessage]);

  // Build tool call info array
  const toolCallInfos = useMemo(
    () => buildToolCallInfos(toolCalls, toolResults),
    [toolCalls, toolResults],
  );

  // Notify scroll manager
  useEffect(() => {
    scroll.onContentChange(totalLines);
  }, [totalLines]);

  // Compute visible messages
  const { visibleMessages, scrollMsg } = useMemo(() => {
    const offset = scroll.offset;
    let accumulated = 0;
    let startIdx = 0;

    for (let i = 0; i < msgHeights.length; i++) {
      const msgH = msgHeights[i]!;
      if (accumulated + msgH <= offset) {
        accumulated += msgH;
        startIdx = i + 1;
      } else {
        break;
      }
    }

    const visible = messages.slice(startIdx);

    const msg =
      offset > 0
        ? `${Math.min(offset, totalLines)}↑ / ${totalLines}`
        : totalLines > viewportHeight
          ? `${totalLines} lines`
          : '';

    return { visibleMessages: visible, scrollMsg: msg };
  }, [messages, msgHeights, totalLines, viewportHeight, scroll.offset]);

  // Scroll keybindings
  useInput((_input, key) => {
    if (key.pageDown) {
      scroll.pageDown(viewportHeight);
    }
    if (key.pageUp) {
      scroll.pageUp(viewportHeight);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Scroll indicator */}
      {scrollMsg && (
        <Box>
          <Text color={theme.scrollIndicator} dimColor>
            {'\u2500\u2500'} {scrollMsg} {'\u2500\u2500'}
          </Text>
        </Box>
      )}

      {/* Visible messages */}
      {visibleMessages.map((msg, i) => (
        <Box key={`msg-${i}`} flexDirection="column" marginBottom={1}>
          {/* Message separator */}
          {i > 0 && <MessageSeparator color={theme.messageSeparator} />}

          {/* Role badge */}
          <Box>
            <RoleBadge role={msg.role} />
            <ElapsedDisplay isLoading={isLoading} color={theme.muted} />
          </Box>

          {/* Content */}
          <Box paddingLeft={1}>
            {msg.role === 'user' || msg.role === 'system' ? (
              <Text wrap="wrap" color={msg.role === 'user' ? theme.userText : theme.assistantText}>
                {msg.content}
              </Text>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
          </Box>
        </Box>
      ))}

      {/* Thinking indicator */}
      <ThinkingIndicator
        isThinking={isThinking}
        reasoningText={reasoningText}
      />

      {/* Tool calls visualizer */}
      <ToolVisualizer calls={toolCallInfos} />

      {/* Streaming text with typewriter effect */}
      <StreamingText
        text={streamingText}
        isStreaming={isLoading && !!streamingText}
        label="Assistant"
      />

      {/* Loading indicator */}
      {isLoading && !streamingText && !isThinking && !status && (
        <Box>
          <Text color={theme.muted}>
            Processing<ElapsedDisplay isLoading={isLoading} color={theme.muted} />...
          </Text>
        </Box>
      )}

      {/* Status */}
      {status && !streamingText && !errorMessage && !isThinking && (
        <Box>
          <Text color={theme.status}>
            {status}<ElapsedDisplay isLoading={isLoading} color={theme.status} />
          </Text>
        </Box>
      )}

      {/* Error display */}
      {errorMessage && (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor={theme.error} paddingX={1} paddingY={0}>
            <Box flexDirection="column">
              <Text bold color={theme.error}>
                {'\u274c'} Error:
              </Text>
              <Text color={theme.error}>{errorMessage}</Text>
              {errorHint && (
                <Box marginTop={0}>
                  <Text color={theme.errorHint}>{'\ud83d\udca1'} {errorHint}</Text>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
