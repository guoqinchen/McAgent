/**
 * ToolVisualizer — structured tool call display for Ink TUI.
 *
 * Shows tool execution with states (pending → running → done/error),
 * prettified arguments, truncated output with expansion, and timing.
 * Uses memo to prevent re-rendering tools whose state hasn't changed.
 */

import { useMemo, memo, useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/use-theme.js';
import { useElapsed, formatElapsed } from '../hooks/use-streaming-agent.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolCallInfo {
  name: string;
  args: unknown;
  /** Tool execution state */
  status: 'pending' | 'running' | 'success' | 'error';
  /** Result text (if completed) */
  result?: string;
  /** Execution duration in ms */
  durationMs?: number;
}

export interface ToolVisualizerProps {
  /** Current tool calls with their states */
  calls: ToolCallInfo[];
  /** Maximum argument display length before truncation */
  maxArgLength?: number;
  /** Maximum result display length before truncation */
  maxResultLength?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatArgs(args: unknown): string {
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, null, 1);
  } catch {
    return String(args);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = memo(function StatusBadge({
  status,
  color,
}: {
  status: ToolCallInfo['status'];
  color: string;
}) {
  switch (status) {
    case 'pending':
      return <Text color={color}>○</Text>;
    case 'running':
      return <Text color={color}>◌</Text>;
    case 'success':
      return <Text color={color}>✓</Text>;
    case 'error':
      return <Text color={color}>✗</Text>;
  }
});

// ─── Progress bar component for long-running tools ──────────────────────────

function ToolProgressBar({ progress, color }: { progress: number; color: string }) {
  const barWidth = 10;
  const filled = Math.min(barWidth, Math.round((progress / 100) * barWidth));
  const empty = barWidth - filled;
  return (
    <Text color={color}>
      {' ['}{'█'.repeat(filled)}{'░'.repeat(empty)}{']'}{' '}{Math.min(progress, 100)}%
    </Text>
  );
}

// ─── Single tool call component ───────────────────────────────────────────────

const ToolCallRow = memo(function ToolCallRow({
  call,
  maxArgLength,
  maxResultLength,
  isLast,
  progress,
}: {
  call: ToolCallInfo;
  maxArgLength: number;
  maxResultLength: number;
  isLast: boolean;
  progress?: { percent: number; elapsed: string; remaining: string } | null;
}) {
  const theme = useTheme();

  const statusColor = useMemo(() => {
    switch (call.status) {
      case 'pending':
        return theme.toolPending;
      case 'running':
        return theme.toolRunning;
      case 'success':
        return theme.toolSuccess;
      case 'error':
        return theme.toolError;
    }
  }, [call.status, theme]);

  const formattedArgs = useMemo(() => formatArgs(call.args), [call.args]);

  const truncatedArgs =
    formattedArgs.length > maxArgLength
      ? formattedArgs.slice(0, maxArgLength) + '…'
      : formattedArgs;

  const hasResult = call.result !== undefined;
  const truncatedResult =
    hasResult && call.result!.length > maxResultLength
      ? call.result!.slice(0, maxResultLength) + '…'
      : call.result;

  return (
    <Box flexDirection="column" marginBottom={isLast ? 0 : 0}>
      {/* Tool call header */}
      <Box>
        <StatusBadge status={call.status} color={statusColor} />
        <Text color={theme.toolName} bold>
          {' '}
          {call.name}
        </Text>
        <Text color={theme.toolCall}> ({truncatedArgs})</Text>
        {call.durationMs !== undefined && (
          <Text color={theme.toolDuration}> [{formatDuration(call.durationMs)}]</Text>
        )}
        {progress && call.status === 'running' && (
          <>
            <ToolProgressBar progress={progress.percent} color={theme.progressBar} />
            <Text color={theme.toolDuration}> {progress.elapsed}</Text>
            {progress.remaining && (
              <Text color={theme.toolDuration}> ~{progress.remaining}</Text>
            )}
          </>
        )}
        {call.status === 'pending' && (
          <Text color={theme.toolPending}> ⏳ queued</Text>
        )}
      </Box>

      {/* Note: full args expansion available via scroll */}
      {formattedArgs.length > maxArgLength && (
        <Box paddingLeft={2}>
          <Text color={theme.muted} dimColor>
            (args truncated, scroll to see full details)
          </Text>
        </Box>
      )}

      {/* Tool result preview */}
      {hasResult && (
        <Box paddingLeft={2}>
          <Text color={call.status === 'error' ? theme.toolError : theme.muted}>
            {truncatedResult}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ─── Timer hook for running tool progress ───────────────────────────────────

function useToolProgress(isRunning: boolean, elapsedMs: number) {
  const [progress, setProgress] = useState<{ percent: number; elapsed: string; remaining: string } | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!isRunning) {
      setProgress(null);
      return;
    }
    startRef.current = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const elapsedStr = elapsed < 2000 ? `${(elapsed / 1000).toFixed(1)}s` : formatElapsed(Math.floor(elapsed / 1000));
      // Simulate progress: slower as time goes on
      const pct = Math.min(95, Math.round((elapsed / 15000) * 100));
      const remaining = pct < 95 ? formatElapsed(Math.round((15000 - elapsed) / 1000)) : '';
      setProgress({ percent: pct, elapsed: elapsedStr, remaining });
    }, 500);
    return () => {
      clearInterval(timer);
      setProgress(null);
    };
  }, [isRunning, elapsedMs]);

  return progress;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ToolVisualizer = memo(function ToolVisualizer({
  calls,
  maxArgLength = 80,
  maxResultLength = 150,
}: ToolVisualizerProps) {
  const theme = useTheme();

  if (calls.length === 0) return null;

  const anyRunning = calls.some((c) => c.status === 'running' || c.status === 'pending');

  // Get elapsed time for the running tool
  const runningCall = calls.find((c) => c.status === 'running');
  const elapsed = useElapsed(!!runningCall);
  const progress = useToolProgress(!!runningCall, elapsed * 1000);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box>
        <Text color={theme.toolCall} bold>
          {'🔧'} Tools
        </Text>
        <Text color={theme.muted}> ({calls.length})</Text>
        {anyRunning && elapsed > 0 && (
          <Text color={theme.toolDuration}> [{formatElapsed(elapsed)}]</Text>
        )}
      </Box>

      {/* Tool calls */}
      <Box flexDirection="column" paddingLeft={1}>
        {calls.map((call, i) => (
          <ToolCallRow
            key={`${call.name}-${i}`}
            call={call}
            maxArgLength={maxArgLength}
            maxResultLength={maxResultLength}
            isLast={i === calls.length - 1}
            progress={call.status === 'running' ? progress : null}
          />
        ))}
      </Box>
    </Box>
  );
});
