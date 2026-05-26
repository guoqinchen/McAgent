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
import { render, Box, Text, useInput, useApp } from 'ink';
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

// ─── ChatMessage component ───────────────────────────────────────────────────

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={isUser ? 'cyan' : 'green'}>
          {isUser ? '▶ You' : '◀ Assistant'}
        </Text>
      </Box>
      <Text wrap="wrap">{message.content}</Text>
    </Box>
  );
}

// ─── Tool call display ───────────────────────────────────────────────────────

function ToolCallLine({ name, args }: { name: string; args: unknown }) {
  const argsStr = JSON.stringify(args);
  return (
    <Box>
      <Text color="yellow"> 🔧 {name}</Text>
      <Text color="gray">({argsStr.length > 80 ? argsStr.slice(0, 80) + '…' : argsStr})</Text>
    </Box>
  );
}

// ─── Input field ─────────────────────────────────────────────────────────────

function InputField({
  value,
  onChange,
  onSubmit,
  disabled,
  onHistoryUp,
  onHistoryDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
}) {
  useInput((input, key) => {
    if (disabled) return;
    if (key.return) {
      onSubmit();
    } else if (key.upArrow) {
      onHistoryUp();
    } else if (key.downArrow) {
      onHistoryDown();
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  return (
    <Box>
      <Text bold color="yellow">
        {'> '}
      </Text>
      <Text>{value}</Text>
      <Text color="gray">{disabled ? ' …' : '█'}</Text>
    </Box>
  );
}

// ─── Streaming text with typing indicator ────────────────────────────────────

function StreamingText({ text }: { text: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="green">
          ◀ Assistant
        </Text>
      </Box>
      <Text wrap="wrap">{text}</Text>
      <Text color="gray">▌</Text>
    </Box>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; args: unknown }>>([]);
  const [status, setStatus] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Keyboard: Ctrl+C or Escape to quit
  useInput((input, key) => {
    if ((key.ctrl && input === 'c') || key.escape) {
      exit();
    }
  });

  // Subscribe to agent events
  useEffect(() => {
    // ── Streaming debounce ───────────────────────────────────────────────
    // Buffer fast token-by-token emits into ~60fps React updates to prevent
    // terminal stuttering from per-token re-renders.
    const WRITE_INTERVAL_MS = 16; // ≈ 60 fps
    let streamBuffer = '';
    let streamFlushTimer: ReturnType<typeof setInterval> | null = null;

    function startStreamBuffer() {
      streamBuffer = '';
      streamFlushTimer = setInterval(() => {
        if (streamBuffer.length > 0) {
          setStreamingText(streamBuffer);
        }
      }, WRITE_INTERVAL_MS);
    }

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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    setInputHistory((prev) => [...prev, text]);
    setHistoryIndex(-1);
    setHistoryDraft('');
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    try {
      await agent.send(text);
    } catch {
      // handled by event
    }
  }, [input, isLoading]);

  const historyUp = useCallback(() => {
    if (inputHistory.length === 0) return;
    const nextIdx = historyIndex === -1 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
    if (historyIndex === -1) setHistoryDraft(input);
    setHistoryIndex(nextIdx);
    setInput(inputHistory[nextIdx] ?? '');
  }, [inputHistory, historyIndex, input]);

  const historyDown = useCallback(() => {
    if (historyIndex === -1) return;
    const nextIdx = historyIndex + 1;
    if (nextIdx >= inputHistory.length) {
      setHistoryIndex(-1);
      setInput(historyDraft);
      setHistoryDraft('');
    } else {
      setHistoryIndex(nextIdx);
      setInput(inputHistory[nextIdx] ?? '');
    }
  }, [inputHistory, historyIndex, historyDraft]);

  // Distinguish completed history from streaming text
  const historyMessages = messages;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} borderStyle="round" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">
          🍏 McAgent
        </Text>
        <Text color="gray"> (Esc to exit)</Text>
      </Box>

      {/* Messages area */}
      <Box flexDirection="column" marginBottom={1}>
        {historyMessages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {/* Tool calls during streaming */}
        {toolCalls.length > 0 &&
          toolCalls.map((tc, i) => <ToolCallLine key={`tc-${i}`} name={tc.name} args={tc.args} />)}

        {/* Streaming text */}
        {streamingText && <StreamingText text={streamingText} />}

        {/* Status indicator */}
        {status && !streamingText && !errorMessage && (
          <Box>
            <Text color="gray">{status}</Text>
          </Box>
        )}

        {/* Error indicator */}
        {errorMessage && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="red">
              ❌ Error:
            </Text>
            <Text color="red">{errorMessage}</Text>
          </Box>
        )}
      </Box>

      {/* Input box */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <InputField
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          disabled={isLoading}
          onHistoryUp={historyUp}
          onHistoryDown={historyDown}
        />
      </Box>
    </Box>
  );
}

render(<App />);
