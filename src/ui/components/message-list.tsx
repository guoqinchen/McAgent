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
 * - Virtual windowing for large message lists (v2.4)
 */

import { useEffect, useState, useMemo, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useScrollManager } from '../hooks/use-scroll-manager.js';
import { useTheme } from '../hooks/use-theme.js';
import { useElapsed, formatElapsed } from '../hooks/use-streaming-agent.js';
import { MarkdownRenderer } from './markdown-renderer.js';
import { ThinkingIndicator } from './thinking-indicator.js';
import { ToolVisualizer } from './tool-visualizer.js';
import { StreamingText } from './streaming-text.js';
import type { Message, ToolProgress } from '../../types/events.js';
import type { ToolCallInfo } from './tool-visualizer.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageListProps {
  messages: Message[];
  streamingText: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; result: string; success: boolean }>;
  toolProgress: ToolProgress | null;
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
  const elapsed = useElapsed(isLoading);

  if (!isLoading || elapsed === 0) return null;

  return <Text color={color}> ({formatElapsed(elapsed)})</Text>;
});

// ─── Message role badge ───────────────────────────────────────────────────────

const RoleBadge = memo(function RoleBadge({
  role,
  showTimestamp,
}: {
  role: 'user' | 'assistant' | 'system';
  showTimestamp?: string;
}) {
  const theme = useTheme();
  const ts = showTimestamp ? formatShortTime(showTimestamp) : null;

  switch (role) {
    case 'user':
      return (
        <Text bold color={theme.userLabel}>
          {'\u25b6'} You
          {ts && <Text color={theme.muted}> {ts}</Text>}
        </Text>
      );
    case 'assistant':
      return (
        <Text bold color={theme.assistantLabel}>
          {'\u25c6'} Assistant
          {ts && <Text color={theme.muted}> {ts}</Text>}
        </Text>
      );
    case 'system':
      return (
        <Text bold color={theme.systemLabel}>
          {'\u2699'} System
          {ts && <Text color={theme.muted}> {ts}</Text>}
        </Text>
      );
  }
});

/** Format ISO timestamp to a short HH:MM:SS display. */
function formatShortTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Message separator ────────────────────────────────────────────────────────

function MessageSeparator({ color, label }: { color: string; label?: string }) {
  const labelPart = label ? ` ${label} ` : '';
  const remaining = Math.max(0, 25 - labelPart.length);
  return (
    <Box>
      <Text color={color} dimColor>
        {'\u2500'.repeat(25)}
        {labelPart}
        {'\u2500'.repeat(remaining)}
      </Text>
    </Box>
  );
}

// ─── Build tool calls with status ─────────────────────────────────────────────

function buildToolCallInfos(
  toolCalls: Array<{ name: string; args: unknown }>,
  toolResults: Array<{ name: string; result: string; success: boolean }>,
): ToolCallInfo[] {
  // Use index-based tracking to handle multiple calls to the same tool name
  const resultByIndex = new Map<number, { name: string; result: string; success: boolean }>();
  for (let ri = 0; ri < toolResults.length; ri++) {
    const tr = toolResults[ri]!;
    // Find the first tool call with matching name that doesn't have a result yet
    for (let ci = 0; ci < toolCalls.length; ci++) {
      if (toolCalls[ci]!.name === tr.name && !resultByIndex.has(ci)) {
        resultByIndex.set(ci, tr);
        break;
      }
    }
  }

  const lastCallIdx = toolCalls.length - 1;

  return toolCalls.map((tc, i) => {
    const result = resultByIndex.get(i);

    return {
      name: tc.name,
      args: tc.args,
      status: result
        ? (result.success ? 'success' : 'error')
        : i === lastCallIdx
          ? 'running'
          : 'pending',
      result: result?.result,
    } as ToolCallInfo;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** Maximum messages to render at once (virtual windowing). */
const MAX_VISIBLE_MESSAGES = 50;

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

  // Precompute line heights (stable reference via useMemo)
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

  // Notify scroll manager (memoized to prevent effect re-run loop)
  useEffect(() => {
    scroll.onContentChange(totalLines);
  }, [totalLines, scroll.onContentChange]);

  // Compute visible messages with virtual windowing
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

    // Apply virtual windowing: cap visible messages to MAX_VISIBLE_MESSAGES
    const endIdx = messages.length;
    const windowStart = startIdx;
    const windowEnd = endIdx;

    // Only apply windowing if we have more messages than the threshold
    let visible = messages.slice(windowStart, windowEnd);
    if (visible.length > MAX_VISIBLE_MESSAGES) {
      // Show last MAX_VISIBLE_MESSAGES + some context from current offset
      const contextStart = Math.max(0, visible.length - MAX_VISIBLE_MESSAGES);
      visible = visible.slice(contextStart);
    }

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

      {/* Visible messages with grouping */}
      {visibleMessages
        .filter((msg, idx, arr) => {
          // Collapse consecutive same-role: only show the last in a run
          if (idx === arr.length - 1) return true;
          if (idx > 0 && arr[idx-1]?.role === msg.role) return false;
          // Check if next message has same role
          const next = arr[idx + 1];
          if (next && next.role === msg.role && msg.role !== 'system') return false;
          return true;
        })
        .map((msg, i, filteredArr) => {
          // Count how many consecutive same-role messages this represents
          const originalIdx = messages.findIndex(m => m.timestamp === msg.timestamp && m.content === msg.content);
          let collapsedCount = 1;
          if (originalIdx >= 0) {
            for (let j = originalIdx + 1; j < messages.length; j++) {
              if (messages[j]?.role === msg.role) collapsedCount++;
              else break;
            }
          }
          const showSep =
            i > 0 && filteredArr[i - 1]?.role !== msg.role;
          const groupLabel = collapsedCount > 1 ? ` (${collapsedCount})` : '';

        return (
          <Box key={`msg-${originalIdx}`} flexDirection="column" marginBottom={1}>
            {/* Message separator between different roles */}
            {showSep && <MessageSeparator color={theme.messageSeparator} />}

            {/* Role badge with timestamp and group count */}
            <Box>
              <RoleBadge role={msg.role} showTimestamp={msg.timestamp} />
              {groupLabel && (
                <Text color={theme.muted}>[{collapsedCount}x]</Text>
              )}
              <ElapsedDisplay isLoading={isLoading} color={theme.muted} />
            </Box>

            {/* Content */}
            <Box paddingLeft={1}>
              {msg.role === 'user' || msg.role === 'system' ? (
                <Text wrap="wrap" color={msg.role === 'user' ? theme.userText : theme.assistantText}>
                  {collapsedCount > 1
                    ? `${msg.content}${groupLabel}`
                    : msg.content}
                </Text>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </Box>
          </Box>
        );
      })}

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
