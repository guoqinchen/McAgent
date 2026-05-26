/**
 * MessageList — scrollable message view for Ink TUI.
 *
 * Renders chat messages with scroll management. Only messages within the
 * viewport are rendered; messages above the fold are skipped. Shows a
 * scroll indicator when the user has scrolled away from the bottom.
 *
 * Scroll: PageUp/PageDown to navigate message history.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useScrollManager } from '../hooks/use-scroll-manager.js';
import type { Message } from '../../types/events.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageListProps {
  messages: Message[];
  streamingText: string;
  toolCalls: Array<{ name: string; args: unknown }>;
  status: string;
  errorMessage: string;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageList({
  messages,
  streamingText,
  toolCalls,
  status,
  errorMessage,
  viewportHeight = 10,
}: MessageListProps) {
  const scroll = useScrollManager();
  const [cols] = useState(() => process.stdout.columns || 80);

  // Compute total lines
  let totalLines = 0;
  for (const msg of messages) {
    totalLines += 1 + estimateLines(msg.content, cols) + 1; // label + content + margin
  }
  if (streamingText) {
    totalLines += 1 + estimateLines(streamingText, cols) + 2;
  }
  totalLines += toolCalls.length;
  if (status && !streamingText && !errorMessage) totalLines += 1;
  if (errorMessage) totalLines += 2;

  // Notify scroll manager of content changes
  const prevTotalRef = useRef(totalLines);
  useEffect(() => {
    scroll.onContentChange(totalLines);
    prevTotalRef.current = totalLines;
  }, [totalLines]);

  // Determine which messages to render
  let accumulated = 0;
  let startIdx = 0;
  const offset = scroll.offset;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const msgLines = 1 + estimateLines(msg.content, cols) + 1;
    if (accumulated + msgLines <= offset) {
      accumulated += msgLines;
      startIdx = i + 1;
    } else {
      break;
    }
  }

  const visibleMessages = messages.slice(startIdx);

  const scrollMsg =
    offset > 0
      ? `${Math.min(offset, totalLines)}↑ / ${totalLines}`
      : totalLines > viewportHeight
        ? `${totalLines} lines`
        : '';

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
          <Text color="gray" dimColor>
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
              <Text bold color={isUser ? 'cyan' : 'green'}>
                {isUser ? '▶ You' : '◀ Assistant'}
              </Text>
            </Box>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        );
      })}

      {/* Streaming text */}
      {streamingText && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="green">
              ◀ Assistant
            </Text>
          </Box>
          <Text wrap="wrap">{streamingText}</Text>
          <Text color="gray">▌</Text>
        </Box>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 &&
        toolCalls.map((tc, i) => (
          <Box key={`tc-${i}`}>
            <Text color="yellow"> 🔧 {tc.name}</Text>
            <Text color="gray">
              ({(() => {
                const s = JSON.stringify(tc.args);
                return s.length > 80 ? s.slice(0, 80) + '…' : s;
              })()})
            </Text>
          </Box>
        ))}

      {/* Status */}
      {status && !streamingText && !errorMessage && (
        <Box>
          <Text color="gray">{status}</Text>
        </Box>
      )}

      {/* Error */}
      {errorMessage && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">
            ❌ Error:
          </Text>
          <Text color="red">{errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}
