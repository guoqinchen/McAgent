#!/usr/bin/env tsx
/**
 * McAgent — Ink TUI
 *
 * Beautiful terminal UI powered by Ink + React.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npm start
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLineEditor } from './ui/hooks/use-line-editor.js';
import { useStreamingAgent } from './ui/hooks/use-streaming-agent.js';
import { MessageList } from './ui/components/message-list.js';
import { render, Box, Text, useInput, useApp } from 'ink';
import { useTheme } from './ui/hooks/use-theme.js';

import { createMacOSAgent } from './agent.js';
import type { Message } from './types/events.js';
import { macOSDefaultTools } from './tools.js';
import { macOSExtendedTools } from './tools-extended.js';
import { macOSProTools } from './tools-pro.js';
import { logger } from './logging/structured-logger.js';
import { resolveConfig } from './config/resolver.js';

// ─── Agent ───────────────────────────────────────────────────────────────────

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('❌  DEEPSEEK_API_KEY environment variable is required.');
  process.exit(1);
}

const config = resolveConfig();

logger.info('TUI starting', {
  model: config.model ?? 'deepseek-v4-flash',
  thinkingEnabled: config.thinkingEnabled ?? true,
  logDir: `${process.env.HOME}/.mcagent/logs/`,
});

const agent = createMacOSAgent({
  apiKey,
  ...config,
  instructions: [
    `You are a macOS expert assistant. Help the user operate their Mac efficiently `,
    `using CLI commands, system utilities, and automation.`,
    ``,
    `Rules:`,
    `- Always explain what a command will do before executing it.`,
    `- For destructive operations (rm, kill -9, sudo, diskutil, etc.), ask the user to confirm.`,
    `- Prefer read-only flags by default.`,
    `- If a command fails, suggest alternatives.`,
  ].join('\n'),
  tools: [...macOSDefaultTools, ...macOSExtendedTools, ...macOSProTools],
});

// ─── Input field ─────────────────────────────────────────────────────────────

function InputField({
  onSubmit,
  disabled,
  onHistoryUp,
  onHistoryDown,
  editorRef,
  promptColor,
}: {
  onSubmit: (value: string) => void;
  disabled: boolean;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  editorRef: React.MutableRefObject<{ setValue: (v: string) => void; value: string } | null>;
  promptColor: string;
}) {
  const editor = useLineEditor();

  useEffect(() => {
    editorRef.current = { setValue: editor.setValue, value: editor.value };
  });

  useInput((input, key) => {
    if (disabled) return;
    if (key.return) {
      if (editor.value.trim()) {
        onSubmit(editor.value.trim());
        editor.clear();
      }
      return;
    }
    if (key.upArrow) {
      onHistoryUp();
      return;
    }
    if (key.downArrow) {
      onHistoryDown();
      return;
    }
    editor.handleInput(input, key);
  });

  const beforeCursor = editor.value.slice(0, editor.cursor);
  const atCursor = editor.value[editor.cursor] || ' ';
  const afterCursor = editor.value.slice(editor.cursor + 1);

  return (
    <Box>
      <Text bold color={promptColor}>
        {'> '}
      </Text>
      <Text>{beforeCursor}</Text>
      <Text inverse>{atCursor}</Text>
      <Text>{afterCursor}</Text>
      {disabled && <Text color="gray"> …</Text>}
      {editor.killRing && !disabled && <Text color="gray"> [cut]</Text>}
    </Box>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
function App() {
  const { exit } = useApp();
  const theme = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; args: unknown }>>([]);

  const [status, setStatus] = useState('');
  const [toolResults, setToolResults] = useState<
    Array<{ name: string; result: string; success: boolean }>
  >([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const editorRef = useRef<{ setValue: (v: string) => void; value: string } | null>(null);

  // Keyboard: Ctrl+C/Escape to quit, Ctrl+L to clear, ? for help
  useInput((input, key) => {
    if ((key.ctrl && input === 'c') || key.escape) {
      if (showHelp) {
        setShowHelp(false);
      } else {
        exit();
      }
      return;
    }
    if (key.ctrl && input === 'l') {
      process.stdout.write('\x1b[2J\x1b[H');
      return;
    }
    if (input === '?' && !showHelp) {
      setShowHelp(true);
      return;
    }
    if (key.ctrl && input === 'd' && editorRef.current?.value === '') {
      exit();
      return;
    }
  });
  // Streaming agent events with 60fps debounce
  useStreamingAgent({
    agent,
    setStreamingText,
    setToolCalls,
    setToolResults,
    setStatus,
    setErrorMessage,
    setMessages,
    setIsLoading,
    onError: (err) => logger.error('Agent error in TUI', err),
    onFrame: (frameMs) => {
      if (frameMs > 50) {
        logger.warn('Slow render frame', { frameTimeMs: Math.round(frameMs) });
      }
    },
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      const trimmed = text.trim();
      setInputHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      setHistoryDraft('');
      setIsLoading(true);
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      try {
        await agent.send(trimmed);
      } catch (err) {
        // Fallback: log and show error in UI (primary handling is via events)
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('TUI send failed', error);
        setErrorMessage(error.message);
      }
    },
    [isLoading]
  );

  const historyUp = useCallback(() => {
    if (inputHistory.length === 0) return;
    const nextIdx = historyIndex === -1 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
    if (historyIndex === -1) setHistoryDraft(editorRef.current?.value ?? '');
    setHistoryIndex(nextIdx);
    editorRef.current?.setValue(inputHistory[nextIdx] ?? '');
  }, [inputHistory, historyIndex]);

  const historyDown = useCallback(() => {
    if (historyIndex === -1) return;
    const nextIdx = historyIndex + 1;
    if (nextIdx >= inputHistory.length) {
      setHistoryIndex(-1);
      editorRef.current?.setValue(historyDraft);
      setHistoryDraft('');
    } else {
      setHistoryIndex(nextIdx);
      editorRef.current?.setValue(inputHistory[nextIdx] ?? '');
    }
  }, [inputHistory, historyIndex, historyDraft]);
  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} borderStyle="round" borderColor={theme.header} paddingX={1}>
        <Text bold color={theme.header}>
          🍏 McAgent
        </Text>
        <Text color={theme.muted}> (? help)</Text>
      </Box>

      {/* Messages area */}
      <MessageList
        messages={messages}
        streamingText={streamingText}
        toolCalls={toolCalls}
        toolResults={toolResults}
        status={status}
        errorMessage={errorMessage}
        isLoading={isLoading}
      />

      {/* Help overlay */}
      {showHelp && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.border}
          padding={1}
          marginBottom={1}
        >
          <Box marginBottom={1}>
            <Text bold color={theme.header}>
              &#x2318; McAgent Help
            </Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Line Editing
            </Text>
            <Text color={theme.muted}> Ctrl+A/E Go to beginning/end of line</Text>
            <Text color={theme.muted}> Alt+B/F Move backward/forward one word</Text>
            <Text color={theme.muted}> Ctrl+K/U/W Cut to end/start/previous word</Text>
            <Text color={theme.muted}> Ctrl+Y Paste last cut text</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Navigation
            </Text>
            <Text color={theme.muted}> PgUp/PgDn Scroll message history</Text>
            <Text color={theme.muted}> Home/End Jump to top/bottom</Text>
            <Text color={theme.muted}> &#8593;/&#8595; Browse input history</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Actions
            </Text>
            <Text color={theme.muted}> Ctrl+L Clear screen</Text>
            <Text color={theme.muted}> Ctrl+C / Esc Quit</Text>
            <Text color={theme.muted}> Ctrl+D Quit (when input is empty)</Text>
          </Box>

          <Box flexDirection="column">
            <Text bold color={theme.heading}>
              Color Key
            </Text>
            <Box>
              <Text color={theme.userLabel}>&#x25CF; User</Text>
              <Text> </Text>
              <Text color={theme.assistantLabel}>&#x25CF; Assistant</Text>
              <Text> </Text>
              <Text color={theme.toolCall}>&#x25CF; Tool</Text>
              <Text> </Text>
              <Text color={theme.error}>&#x25CF; Error</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Input box */}
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <InputField
          onSubmit={sendMessage}
          disabled={isLoading}
          onHistoryUp={historyUp}
          onHistoryDown={historyDown}
          editorRef={editorRef}
          promptColor={theme.inputPrompt}
        />
      </Box>
    </Box>
  );
}

render(<App />);
