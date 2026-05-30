/**
 * StreamingText — typewriter-effect text display for Ink TUI.
 *
 * Animates streaming text with a blinking cursor, char/word reveal rate
 * indicators, and real-time stats (chars/s, elapsed). The component is
 * designed to be updated at ~60fps from the useStreamingAgent hook but
 * renders efficiently via memo.
 *
 * v2.4: Fixed TypewriterContent effect dependency chain to prevent
 *       unnecessary re-renders. Optimized BlinkingCursor with stable
 *       animation timer.
 */

import { useEffect, useState, useRef, memo } from 'react';
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

// ─── Blinking cursor ──────────────────────────────────────────────────────────

function BlinkingCursor({ color }: { color: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible((v) => !v);
    }, 530); // Standard terminal cursor blink rate
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={color}>
      {visible ? '▌' : ' '}
    </Text>
  );
}

// ─── Typewriter animation helper ──────────────────────────────────────────────
// Gradually reveals text character by character for a smooth reading experience.
// This is a separate component so it can have its own animation state.

function TypewriterContent({ text, isStreaming, color }: {
  text: string;
  isStreaming: boolean;
  color: string;
}) {
  const [revealedCount, setRevealedCount] = useState(0);
  const lastTextRef = useRef('');
  const revealedRef = useRef(0);

  // Sync ref on state change to avoid stale closures
  revealedRef.current = revealedCount;

  // When new text arrives, start revealing it character by character
  useEffect(() => {
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;

    if (isStreaming) {
      // While streaming, reveal text gradually but stay close to the end
      const revealed = revealedRef.current;
      const newChars = text.length - revealed;
      if (newChars > 3) {
        // Reveal a chunk using ref to break dependency on revealedCount
        const chunkSize = Math.min(newChars, Math.max(3, Math.floor(newChars / 2)));
        const timer = setTimeout(() => {
          setRevealedCount((prev) => Math.min(text.length, prev + chunkSize));
        }, 15);
        return () => clearTimeout(timer);
      } else {
        setRevealedCount(text.length);
      }
    } else {
      // When not streaming, immediately show all text
      setRevealedCount(text.length);
    }
  }, [text, isStreaming]);

  // Reset when text clears
  useEffect(() => {
    if (text === '') {
      setRevealedCount(0);
      lastTextRef.current = '';
    }
  }, [text]);

  // When streaming is done, reveal all remaining text immediately
  useEffect(() => {
    if (!isStreaming && text.length > 0) {
      setRevealedCount(text.length);
    }
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

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
