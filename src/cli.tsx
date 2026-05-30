#!/usr/bin/env tsx
/**
 * McAgent — Ink TUI
 *
 * Beautiful terminal UI powered by Ink + React.
 *
 * v2.3: Enhanced UX with context status bar, progress indicators,
 *       permission prompts, onboarding, and improved keyboard shortcuts.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npm start
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useLineEditor } from './ui/hooks/use-line-editor.js';
import { useStreamingAgent } from './ui/hooks/use-streaming-agent.js';
import { MessageList } from './ui/components/message-list.js';
import { render, Box, Text, useInput, useApp } from 'ink';
import { useTheme } from './ui/hooks/use-theme.js';

import { createMacOSAgent } from './agent.js';
import type { Message, AgentContext, ToolProgress, PermissionRequest } from './types/events.js';
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

// ─── Onboarding ─────────────────────────────────────────────────────────────

const ONBOARDING_KEY = 'mcagent_onboarding_v2';
function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}
function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // Ignore in environments without localStorage
  }
}

const OnboardingOverlay = memo(function OnboardingOverlay({
  onDismiss,
  theme,
}: {
  onDismiss: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.header}
      padding={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color={theme.header}>
          🎉 Welcome to McAgent!
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Your AI-powered macOS CLI assistant. Ask me anything about your Mac!
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.heading}>
          Quick Tips
        </Text>
        <Text color={theme.muted}>
          {'  '}• Type your question and press Enter to chat
        </Text>
        <Text color={theme.muted}>
          {'  '}• Press ? to show help at any time
        </Text>
        <Text color={theme.muted}>
          {'  '}• Press Ctrl+L to clear the screen
        </Text>
        <Text color={theme.muted}>
          {'  '}• Press Ctrl+C or Esc to exit
        </Text>
        <Text color={theme.muted}>
          {'  '}• Use ↑/↓ to browse your message history
        </Text>
      </Box>
      <Box>
        <Text bold color={theme.success}>
          Press Enter to start using McAgent →
        </Text>
      </Box>
    </Box>
  );
});

// ─── Status bar ─────────────────────────────────────────────────────────────

function StatusBar({
  context,
  theme,
}: {
  context: AgentContext | null;
  theme: ReturnType<typeof useTheme>;
}) {
  if (!context) return null;

  const cwdDisplay =
    context.cwd.length > 40 ? '…' + context.cwd.slice(-37) : context.cwd;

  const modeIcon =
    context.permissionMode === 'auto'
      ? '⚡'
      : context.permissionMode === 'readonly'
        ? '🔒'
        : '🛡️';

  return (
    <Box marginTop={1}>
      <Text color={theme.muted} dimColor>
        {' '}
        {modeIcon} {context.permissionMode} │ {context.model} │ {cwdDisplay} │{' '}
        {context.messageCount} msgs
        {context.isProcessing ? ' ⏳' : ''}
      </Text>
    </Box>
  );
}

// ─── Permission prompt ──────────────────────────────────────────────────────

function PermissionPrompt({
  request,
  theme,
}: {
  request: PermissionRequest;
  theme: ReturnType<typeof useTheme>;
}) {
  const dangerColor =
    request.dangerLevel === 'destructive'
      ? theme.error
      : request.dangerLevel === 'dangerous'
        ? theme.warning
        : request.dangerLevel === 'caution'
          ? theme.permissionHighlight
          : theme.success;

  const dangerLabel = request.dangerLevel
    ? ({
        safe: 'Safe operation',
        caution: 'Proceed with caution',
        dangerous: 'Dangerous operation',
        destructive: 'Destructive operation',
      } as Record<string, string>)[request.dangerLevel]
    : '';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={dangerColor}
      padding={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text bold color={dangerColor}>
          ⚠ Permission Request
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Tool: <Text bold>{request.toolName}</Text>
        </Text>
        <Text>{request.description}</Text>
        {request.command && (
          <Text color={theme.inlineCode}>
            Command: <Text bold>{request.command}</Text>
          </Text>
        )}
        {dangerLabel && <Text color={dangerColor}>{dangerLabel}</Text>}
      </Box>
      <Box>
        <Text color={theme.success}>
          {' '}Enter — Approve
        </Text>
        <Text> </Text>
        <Text color={theme.error}>
          Esc — Deny
        </Text>
      </Box>
    </Box>
  );
}

// ─── Input field ─────────────────────────────────────────────────────────────

function InputField({
  onSubmit,
  disabled,
  onHistoryUp,
  onHistoryDown,
  editorRef,
  promptColor,
  placeholder,
}: {
  onSubmit: (value: string) => void;
  disabled: boolean;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  editorRef: React.MutableRefObject<{ setValue: (v: string) => void; value: string } | null>;
  promptColor: string;
  placeholder?: string;
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

  // Show placeholder when input is empty and not loading
  if (editor.value === '' && !disabled && placeholder) {
    return (
      <Box>
        <Text bold color={promptColor}>
          {'> '}
        </Text>
        <Text color="gray" dimColor>
          {placeholder}
        </Text>
      </Box>
    );
  }

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
  const [showOnboarding, setShowOnboarding] = useState(!hasSeenOnboarding());
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; args: unknown }>>([]);
  const [toolProgress, setToolProgress] = useState<ToolProgress | null>(null);
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);

  const [status, setStatus] = useState('');
  const [toolResults, setToolResults] = useState<
    Array<{ name: string; result: string; success: boolean }>
  >([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const editorRef = useRef<{ setValue: (v: string) => void; value: string } | null>(null);

  // Keyboard: comprehensive shortcuts
  useInput((input, key) => {
    // Handle permission prompt first
    if (permissionRequest) {
      if (key.return || key.escape) {
        setPermissionRequest(null);
      }
      return; // Block all other input during permission prompt
    }

    // Handle onboarding dismiss
    if (showOnboarding) {
      if (key.return || key.escape || input === ' ') {
        setShowOnboarding(false);
        markOnboardingSeen();
      }
      return;
    }

    // Handle help overlay
    if (showHelp) {
      if (key.escape || (key.ctrl && input === 'c')) {
        setShowHelp(false);
        return;
      }
      return;
    }

    // Global shortcuts
    if ((key.ctrl && input === 'c') || key.escape) {
      exit();
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
    // Ctrl+R: recall last recent input
    if (key.ctrl && input === 'r' && inputHistory.length > 0) {
      editorRef.current?.setValue(inputHistory[inputHistory.length - 1] ?? '');
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
    setToolProgress,
    setAgentContext,
    setPermissionRequest,
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

      // Handle slash commands
      if (trimmed.startsWith('/')) {
        handleSlashCommand(trimmed, setStatus, setErrorMessage, setMessages);
        return;
      }

      setInputHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      setHistoryDraft('');
      setIsLoading(true);
      setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
      try {
        await agent.send(trimmed);
      } catch (err) {
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
        <Text color={theme.muted}> (? help, ↑ history, Ctrl+R recall)</Text>
      </Box>

      {/* Onboarding overlay — first-time experience */}
      {showOnboarding && (
        <OnboardingOverlay
          onDismiss={() => { setShowOnboarding(false); markOnboardingSeen(); }}
          theme={theme}
        />
      )}

      {/* Permission prompt overlay */}
      {permissionRequest && (
        <PermissionPrompt request={permissionRequest} theme={theme} />
      )}

      {/* Messages area */}
      <MessageList
        messages={messages}
        streamingText={streamingText}
        toolCalls={toolCalls}
        toolResults={toolResults}
        toolProgress={toolProgress}
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
            <Text color={theme.muted}> Ctrl+A/E  Beginning/end of line</Text>
            <Text color={theme.muted}> Alt+B/F   Backward/forward one word</Text>
            <Text color={theme.muted}> Ctrl+K/U/W Cut to end/start/previous word</Text>
            <Text color={theme.muted}> Ctrl+Y    Paste last cut text</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Navigation
            </Text>
            <Text color={theme.muted}> PgUp/PgDn Scroll message history</Text>
            <Text color={theme.muted}> Home/End  Jump to top/bottom</Text>
            <Text color={theme.muted}> ↑/↓       Browse input history</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Actions
            </Text>
            <Text color={theme.muted}> ?         Show this help</Text>
            <Text color={theme.muted}> Ctrl+L    Clear screen</Text>
            <Text color={theme.muted}> Ctrl+R    Recall last input</Text>
            <Text color={theme.muted}> Ctrl+C    Quit</Text>
            <Text color={theme.muted}> Ctrl+D    Quit (when input is empty)</Text>
          </Box>
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Slash Commands
            </Text>
            <Text color={theme.muted}> /mode     Switch permission mode</Text>
            <Text color={theme.muted}> /clear    Clear conversation</Text>
            <Text color={theme.muted}> /help     Show help</Text>
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
              <Text color={theme.progressBar}>&#x25CF; Progress</Text>
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
          disabled={isLoading || permissionRequest !== null}
          onHistoryUp={historyUp}
          onHistoryDown={historyDown}
          editorRef={editorRef}
          promptColor={theme.inputPrompt}
          placeholder="Type a message or /help..."
        />
      </Box>

      {/* Status bar with context */}
      <StatusBar context={agentContext} theme={theme} />
    </Box>
  );
}

// ─── Slash command handler ─────────────────────────────────────────────────

function handleSlashCommand(
  cmd: string,
  setStatus: (s: string) => void,
  setErrorMessage: (s: string) => void,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
): void {
  const parts = cmd.split(/\s+/);
  const command = parts[0]?.toLowerCase();

  switch (command) {
    case '/mode': {
      const mode = parts[1]?.toLowerCase();
      if (mode === 'approve' || mode === 'readonly' || mode === 'auto') {
        agent.setPermissionMode(mode);
        setStatus(`✓ Permission mode set to "${mode}"`);
        setTimeout(() => setStatus(''), 3000);
      } else {
        setErrorMessage(
          `Unknown mode "${parts[1] ?? ''}". Use: /mode approve|readonly|auto`
        );
        setTimeout(() => setErrorMessage(''), 3000);
      }
      break;
    }
    case '/clear':
      agent.clearHistory();
      setMessages([]);
      setStatus('✓ Conversation cleared');
      setTimeout(() => setStatus(''), 2000);
      break;
    case '/help':
      setStatus('Press ? to show help');
      setTimeout(() => setStatus(''), 2000);
      break;
    default:
      setErrorMessage(`Unknown command: ${command}. Try /mode, /clear, or /help`);
      setTimeout(() => setErrorMessage(''), 3000);
  }
}

render(<App />);
