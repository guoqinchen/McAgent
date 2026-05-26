/**
 * MessageList — scrollable message view for Ink TUI.
 *
 * Renders chat messages with scroll management, enhanced error display,
 * loading state with elapsed time, and tool execution feedback.
 *
 * Scroll: PageUp/PageDown to navigate message history.
 */

import { useEffect, useState, useMemo, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useScrollManager } from '../hooks/use-scroll-manager.js';
import { useTheme } from '../hooks/use-theme.js';
import { MarkdownRenderer } from './markdown-renderer.js';
import type { Message } from '../../types/events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageListProps {
  messages: Message[];
  streamingText: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  toolResults: Array<{ name: string; result: string; success: boolean }>;
  status: string;
  errorMessage: string;
  isLoading: boolean;
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

// ─── Elapsed Timer (isolated to prevent parent re-renders) ────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

export function MessageList({
  messages,
  streamingText,
  toolCalls,
  toolResults,
  status,
  errorMessage,
  isLoading,
  viewportHeight = 10,
}: MessageListProps) {
  const scroll = useScrollManager();
  const theme = useTheme();
  const [cols] = useState(() => process.stdout.columns || 80);

  // Precompute line heights once — used by totalLines and scroll offset
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

  // Compute total lines once per render cycle
  const totalLines = useMemo(() => {
    let total = 0;
    for (const h of msgHeights) total += h;
    if (streamingHeight) total += streamingHeight;
    total += toolCalls.length;
    total += toolResults.length;
    if (status && !streamingText && !errorMessage) total += 1;
    if (errorMessage) total += 3;
    return total;
  }, [msgHeights, streamingHeight, toolCalls.length, toolResults.length, status, streamingText, errorMessage]);

  // Error classification for recovery hints
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

  // Notify scroll manager of content changes
  useEffect(() => {
    scroll.onContentChange(totalLines);
  }, [totalLines]);

  // Determine which messages to render — uses precomputed heights
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

  // Scroll keybindings — only PageUp/PageDown to avoid conflict with text input
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
            ── {scrollMsg} ──
          </Text>
        </Box>
      )}

      {/* Visible messages */}
      {visibleMessages.map((msg, i) => {
        const isUser = msg.role === 'user';
        return (
          <Box key={`msg-${i}`} flexDirection="column" marginBottom={1}>
            <Box>
              <Text bold color={isUser ? theme.userLabel : theme.assistantLabel}>
                {isUser ? '▶ You' : '◀ Assistant'}
              </Text>
            </Box>
            {isUser ? (
              <Text wrap="wrap">{msg.content}</Text>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
          </Box>
        );
      })}

      {/* Streaming text */}
      {streamingText && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color={theme.assistantLabel}>
              ◀ Assistant
            </Text>
            <ElapsedDisplay isLoading={isLoading} color={theme.muted} />
          </Box>
          <Text wrap="wrap">{streamingText}</Text>
          <Text color={theme.streamingIndicator}>▌</Text>
        </Box>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 &&
        toolCalls.map((tc, i) => (
          <Box key={`tc-${i}`}>
            <Text color={theme.toolCall}> 🔧 {tc.name}</Text>
            <Text color={theme.muted}>
              ({(() => {
                const s = JSON.stringify(tc.args);
                return s.length > 80 ? s.slice(0, 80) + '…' : s;
              })()})
            </Text>
          </Box>
        ))}

      {/* Tool results */}
      {toolResults.length > 0 &&
        toolResults.map((tr, i) => (
          <Box key={`tr-${i}`}>
            <Text color={tr.success ? theme.success : theme.warning}>
              {tr.success ? '  ✓' : '  ✗'} {tr.name}:{' '}
            </Text>
            <Text color={theme.muted}>
              {tr.result.length > 120 ? tr.result.slice(0, 120) + '…' : tr.result}
            </Text>
          </Box>
        ))}

      {/* Loading indicator with elapsed time */}
      {isLoading && !streamingText && !status && (
        <Box>
          <Text color={theme.muted}>
            🤔 Processing<ElapsedDisplay isLoading={isLoading} color={theme.muted} />…
          </Text>
        </Box>
      )}

      {/* Status */}
      {status && !streamingText && !errorMessage && (
        <Box>
          <Text color={theme.status}>
            {status}<ElapsedDisplay isLoading={isLoading} color={theme.status} />
          </Text>
        </Box>
      )}

      {/* Error */}
      {errorMessage && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.error}>
            ❌ Error:
          </Text>
          <Text color={theme.error}>{errorMessage}</Text>
          {errorHint && (
            <Box marginTop={0}>
              <Text color={theme.warning}>💡 {errorHint}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
