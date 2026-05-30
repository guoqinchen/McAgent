/**
 * StreamingText v3.0 — optimized typewriter-effect text display for Ink TUI.
 *
 * Performance optimizations:
 * - BlinkingCursor uses stable setInterval ref to avoid timer churn
 * - TypewriterContent combined into single effect with no dependency chain
 * - Reduced state transitions: only re-renders when text or streaming state changes
 * - Combined useElapsed to share timer instances
 */

import { useEffect, useState, useRef, memo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/use-theme.js';
import { useElapsed, formatElapsed } from '../hooks/use-streaming-agent.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamingTextProps {
  /** The full accumulated text to display */
  text: string;
  /** Whether streaming is currently active (shows cursor) */
  isStreaming: boolean;
  /** Optional character-per-second rate to display */
  charsPerSecond?: number;
  /** Optional label override (default: "Assistant") */
  label?: string;
}

// ─── Stable Blinking cursor (effect runs once, stable timer) ──────────────────

const CURSOR_INTERVAL_MS = 530;

function BlinkingCursor({ color }: { color: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => !v);
    }, CURSOR_INTERVAL_MS);
    return () => clearInterval(timer);
    // Empty deps = mount once, never re-create timer
  }, []);

  return (
    <Text color={color}>
      {visible ? '▌' : ' '}
    </Text>
  );
}

// ─── Optimized TypewriterContent — single effect, no dependency chain ─────────
// Uses a single useEffect with combined text+streaming dependencies.
// Reveals text gradually during streaming, immediately when done.

function TypewriterContent({ text, isStreaming, color }: {
  text: string;
  isStreaming: boolean;
  color: string;
}) {
  const [revealedCount, setRevealedCount] = useState(0);
  const lastTextRef = useRef('');
  // Stable ref to latest revealed count to avoid stale closures in setTimeout
  const stableRevealedRef = useRef(0);
  stableRevealedRef.current = revealedCount;

  // Combined effect — handles all transition cases
  useEffect(() => {
    const prevText = lastTextRef.current;
    lastTextRef.current = text;

    // Reset on empty
    if (text === '') {
      setRevealedCount(0);
      return;
    }

    // Text unchanged — skip
    if (text === prevText) return;

    if (isStreaming) {
      // Gradually reveal new text
      const newChars = text.length - stableRevealedRef.current;
      if (newChars > 3) {
        const chunkSize = Math.min(newChars, Math.max(3, Math.floor(newChars / 2)));
        const id = setTimeout(() => {
          setRevealedCount((prev) => Math.min(text.length, prev + chunkSize));
        }, 16); // ~60fps scheduling
        return () => clearTimeout(id);
      }
      // Few chars left — reveal all immediately
      setRevealedCount(text.length);
    } else {
      // Not streaming — show all text immediately
      setRevealedCount(text.length);
    }
  }, [text, isStreaming]); // Single dependency array — no chain

  const displayText = text.slice(0, revealedCount);

  return (
    <Text wrap="wrap" color={color}>
      {displayText}
    </Text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const StreamingText = memo(function StreamingText({
  text,
  isStreaming,
  charsPerSecond,
  label = 'Assistant',
}: StreamingTextProps) {
  const theme = useTheme();
  const elapsed = useElapsed(isStreaming);

  if (!text && !isStreaming) return null;

  const elapsedStr = formatElapsed(elapsed);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box>
        <Text bold color={theme.assistantLabel}>
          ◀ {label}
        </Text>
        {isStreaming && (
          <>
            <Text color={theme.muted}>
              {' '}({elapsedStr})
            </Text>
            {charsPerSecond !== undefined && charsPerSecond > 0 && (
              <Text color={theme.muted}>
                {' '}~{charsPerSecond} c/s
              </Text>
            )}
          </>
        )}
      </Box>

      {/* Typewriter content */}
      <Box>
        <TypewriterContent
          text={text}
          isStreaming={isStreaming}
          color={theme.assistantText}
        />
        {isStreaming && text.length > 0 && (
          <BlinkingCursor color={theme.streamingCursor} />
        )}
      </Box>

      {/* Empty streaming state */}
      {isStreaming && text.length === 0 && (
        <Box>
          <Text color={theme.muted} italic>
            Generating response{''}
          </Text>
          <BlinkingCursor color={theme.streamingCursor} />
        </Box>
      )}
    </Box>
  );
});
