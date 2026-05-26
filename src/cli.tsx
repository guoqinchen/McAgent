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
import { MessageList } from './ui/components/message-list.js';
import { render, Box, Text, useInput, useApp } from 'ink';
import { useTheme } from './ui/hooks/use-theme.js';



import { createMacOSAgent } from './agent.js';
import type { Message } from './types/events.js';
import { macOSDefaultTools } from './tools.js';
import { macOSExtendedTools } from './tools-extended.js';
import { macOSProTools } from './tools-pro.js';
import { logger } from './logging/structured-logger.js';

// ─── Agent ───────────────────────────────────────────────────────────────────

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('❌  DEEPSEEK_API_KEY environment variable is required.');
  process.exit(1);
}

logger.info('TUI starting', {
  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  thinkingEnabled: process.env.DEEPSEEK_THINKING_ENABLED !== 'false',
  logDir: `${process.env.HOME}/.mcagent/logs/`,
});

const agent = createMacOSAgent({
  apiKey,
  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  thinkingEnabled: process.env.DEEPSEEK_THINKING_ENABLED !== 'false',
  reasoningEffort: (process.env.DEEPSEEK_REASONING_EFFORT as 'high' | 'max') || 'high',
  maxContextTokens: Number(process.env.DEEPSEEK_MAX_TOKENS) || undefined,
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
}: {
  onSubmit: (value: string) => void;
  disabled: boolean;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  editorRef: React.MutableRefObject<{ setValue: (v: string) => void; value: string } | null>;
}) {
  const editor = useLineEditor();

  // Expose editor commands to parent (for history navigation)
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

  // Render value with cursor indicator
  const beforeCursor = editor.value.slice(0, editor.cursor);
  const atCursor = editor.value[editor.cursor] || ' ';
  const afterCursor = editor.value.slice(editor.cursor + 1);

  return (
    <Box>
      <Text bold color="yellow">
        {'> '}
      </Text>
      <Text>{beforeCursor}</Text>
      <Text inverse>{atCursor}</Text>
      <Text>{afterCursor}</Text>
      {disabled && <Text color="gray"> …</Text>}
      {editor.killRing && !disabled && (
        <Text color="gray"> [cut]</Text>
      )}
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
    if ((key.ctrl && input === 'd') && editorRef.current?.value === '') {
      exit();
      return;
    }
  });
  // ── Streaming debounce ───────────────────────────────────────────────
  useEffect(() => {
    // Buffer fast token-by-token emits into ~60fps React updates to prevent
    // terminal stuttering from per-token re-renders.
    const WRITE_INTERVAL_MS = 16; // ≈ 60 fps
    let streamBuffer = '';
    let streamFlushTimer: ReturnType<typeof setInterval> | null = null;

    function flushStreamBuffer() {
      if (streamFlushTimer !== null) {
        clearInterval(streamFlushTimer);
        streamFlushTimer = null;
      }
      if (streamBuffer.length > 0) {
        setStreamingText(streamBuffer);
      }
      streamBuffer = '';
    }

    const onThinkingStart = () => {
      flushStreamBuffer();
      setStreamingText('');
      setToolCalls([]);
      setStatus('🤔 Processing…');
      setErrorMessage('');
    };

    const onStreamDelta = (_delta: string, accumulated: string) => {
      // Store latest accumulated text; the interval timer pushes it to state
      streamBuffer = accumulated;
      if (!streamFlushTimer) {
        // First delta — start the periodic flush
        streamFlushTimer = setInterval(() => {
          if (streamBuffer.length > 0) {
            setStreamingText(streamBuffer);
          }
        }, WRITE_INTERVAL_MS);
      }
    };

    const onStreamEnd = (_fullText: string) => {
      flushStreamBuffer();
      setStatus('');
      setStreamingText('');
    };

    const onToolCall = (name: string, args: unknown) => {
      flushStreamBuffer();
      setToolCalls((prev) => [...prev, { name, args }]);
    };

    const onMessageAssistant = () => {
      flushStreamBuffer();
      setMessages(agent.getMessages());
      setIsLoading(false);
      setStreamingText('');
      setToolCalls([]);
      setErrorMessage('');
    };

    const onError = () => {
      flushStreamBuffer();
      setIsLoading(false);
      setStatus('');
    };

    const onReasoningDelta = (_text: string) => {
      setStatus(`💭 Thinking…`);
    };

    agent.on('thinking:start', onThinkingStart);
    agent.on('stream:delta', onStreamDelta);
    agent.on('stream:end', onStreamEnd);
    agent.on('tool:call', onToolCall);
    agent.on('message:assistant', onMessageAssistant);
    agent.on('error', onError);
    agent.on('reasoning:delta', onReasoningDelta);

    const onErrorWithLog = (err: Error) => {
      logger.error('Agent error in TUI', err);
      setErrorMessage(err.message);
      onError();
    };
    agent.off('error', onError);
    agent.on('error', onErrorWithLog);

    return () => {
      flushStreamBuffer();
      agent.off('thinking:start', onThinkingStart);
      agent.off('stream:delta', onStreamDelta);
      agent.off('stream:end', onStreamEnd);
      agent.off('tool:call', onToolCall);
      agent.off('message:assistant', onMessageAssistant);
      agent.off('error', onErrorWithLog);
      agent.off('reasoning:delta', onReasoningDelta);
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const trimmed = text.trim();
    setInputHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setHistoryDraft('');
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    try {
      await agent.send(trimmed);
    } catch {
      // handled by event
    }
  }, [isLoading]);

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
        status={status}
        errorMessage={errorMessage}
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
          <Text bold>Keyboard Shortcuts</Text>
          <Text color={theme.muted}>Ctrl+A/E     Beginning/End of line</Text>
          <Text color={theme.muted}>Ctrl+K/U/W   Kill to end/start/word</Text>
          <Text color={theme.muted}>Ctrl+Y       Yank (paste) last kill</Text>
          <Text color={theme.muted}>Alt+B/F      Back/Forward one word</Text>
          <Text color={theme.muted}>PgUp/PgDn    Scroll message history</Text>
          <Text color={theme.muted}>Ctrl+L       Clear screen</Text>
          <Text color={theme.muted}>Ctrl+C/Esc   Quit</Text>
          <Text color={theme.muted}>?            Toggle this help</Text>
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
        />
      </Box>
    </Box>
  );
}

render(<App />);
