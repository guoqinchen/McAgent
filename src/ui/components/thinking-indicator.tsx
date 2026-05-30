/**
 * ThinkingIndicator — animated agent thinking state visualization.
 *
 * Shows a spinning indicator, elapsed time, and optional reasoning text
 * from DeepSeek's reasoning_content. Uses useInterval-style effect to
 * animate the spinner at ~4fps without causing excessive re-renders.
 */

import { useEffect, useState, memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/use-theme.js';

// ─── Spinner frames ───────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThinkingIndicatorProps {
  /** Whether the agent is currently thinking */
  isThinking: boolean;
  /** Optional reasoning text from the model (DeepSeek reasoning_content) */
  reasoningText?: string;
  /** Optional status label override (default: "Thinking") */
  label?: string;
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function useElapsed(isActive: boolean): number {
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
    }, 500);
    return () => clearInterval(timer);
  }, [isActive]);

  return elapsed;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ThinkingIndicator = memo(function ThinkingIndicator({
  isThinking,
  reasoningText = '',
  label = 'Thinking',
}: ThinkingIndicatorProps) {
  const theme = useTheme();
  const [frameIdx, setFrameIdx] = useState(0);
  const elapsed = useElapsed(isThinking);

  // Animate spinner frame
  useEffect(() => {
    if (!isThinking) {
      setFrameIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 250);
    return () => clearInterval(timer);
  }, [isThinking]);

  if (!isThinking) return null;

  const elapsedStr =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : elapsed >= 1
        ? `${elapsed}s`
        : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Spinner + label line */}
      <Box>
        <Text color={theme.thinkingSpinner}>{SPINNER_FRAMES[frameIdx]}</Text>
        <Text color={theme.thinkingLabel} bold>
          {' '}{label}
        </Text>
        {elapsedStr && (
          <Text color={theme.thinkingTimer}>
            {' '}({elapsedStr})
          </Text>
        )}
      </Box>

      {/* Reasoning content */}
      {reasoningText && (
        <Box paddingLeft={2} marginTop={0}>
          <Text color={theme.reasoning} italic dimColor>
            {reasoningText.length > 120
              ? reasoningText.slice(0, 120) + '…'
              : reasoningText}
          </Text>
        </Box>
      )}

      {/* Animated dots */}
      <Box paddingLeft={2}>
        <Text color={theme.muted}>
          {elapsed < 5 ? '分析中' : elapsed < 15 ? '仍在思考' : '深度思考中'}
          {'.'.repeat((frameIdx % 3) + 1)}
        </Text>
      </Box>
    </Box>
  );
});
