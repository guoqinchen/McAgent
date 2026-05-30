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
          🎉 Welcome to McAgent v2.5!
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Your AI-powered macOS CLI assistant. I help you operate your Mac
          efficiently using CLI commands, system utilities, and automation.
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.heading}>
          ⚡ Quick Start
        </Text>
        <Text color={theme.muted}>
          {'  '}• Just type your question and press <Text bold>Enter</Text> to chat
        </Text>
        <Text color={theme.muted}>
          {'  '}• Try: <Text italic>"How much disk space do I have?"</Text>
        </Text>
        <Text color={theme.muted}>
          {'  '}• Try: <Text italic>"Show me running processes"</Text>
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.heading}>
          ⌨ Keyboard Shortcuts
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>?</Text> — Show full help menu
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>Ctrl+L</Text> — Clear screen
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>↑/↓</Text> — Browse message history
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>Ctrl+R</Text> — Recall last input
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>Ctrl+C/Esc</Text> — Exit
        </Text>
        <Text color={theme.muted}>
          {'  '}• <Text bold>/mode</Text> — Switch permission mode
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={theme.heading}>
          🛡 Permission Modes
        </Text>
        <Text color={theme.muted}>
          {'  '}• approve (default) — I ask before risky operations
        </Text>
        <Text color={theme.muted}>
          {'  '}• readonly — I only read, never modify
        </Text>
        <Text color={theme.muted}>
          {'  '}• auto — I operate freely on safe commands
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text bold color={theme.success}>
          Press Enter to start →{'\u00a0'}
        </Text>
        <Text color={theme.muted}>
          (or Esc to skip this welcome)
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
          ? theme.warning
          : theme.success;

  const dangerLabel = request.dangerLevel
    ? ({
        safe: '✅ Safe — no risk to system',
        caution: '⚠️ Caution — minor impact possible',
        dangerous: '🔴 Dangerous — potential system impact',
        destructive: '💀 Destructive — can irreversibly modify data',
      } as Record<string, string>)[request.dangerLevel]
    : '';

  const impactDescription =
    request.dangerLevel === 'destructive'
      ? 'This operation can modify or delete system files/data irreversibly.'
      : request.dangerLevel === 'dangerous'
        ? 'This operation can significantly affect system state or running processes.'
        : request.dangerLevel === 'caution'
          ? 'This operation makes minor changes but is generally safe.'
          : 'This is a read-only or safe operation.';

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
          {'⚠'} Permission Request
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Tool: <Text bold>{request.toolName}</Text>
        </Text>
        <Text>{request.description}</Text>
        {request.command && (
          <Box marginTop={0}>
            <Text color={theme.inlineCode}>
              Command: <Text bold>{request.command}</Text>
            </Text>
          </Box>
        )}
        {dangerLabel && (
          <Box marginTop={0}>
            <Text color={dangerColor}>{dangerLabel}</Text>
          </Box>
        )}
        <Box marginTop={0}>
          <Text color={theme.muted}>{'📋'} {impactDescription}</Text>
        </Box>
        <Box marginTop={0}>
          <Text color={theme.muted} dimColor>
            {'💡'} To skip future prompts, use <Text bold>/mode auto</Text> (less safe) or{' '}
            <Text bold>/mode readonly</Text> (more restrictive).
          </Text>
        </Box>
      </Box>
      <Box>
        <Text color={theme.success}>
          {' '}Enter — Approve {' '}
        </Text>
        <Text color={theme.error}>
          Esc — Deny {' '}
        </Text>
        <Text color={theme.muted}>
          /mode — Change settings
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
  const [isThinking, setIsThinking] = useState(false);
  const [reasoningText, setReasoningText] = useState('');
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
      if (key.return) {
        setPermissionRequest(null);
        setStatus('✅ Permission approved');
        setTimeout(() => setStatus(''), 2000);
      } else if (key.escape) {
        setPermissionRequest(null);
        setStatus('⛔ Permission denied');
        setTimeout(() => setStatus(''), 2000);
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
      if (key.escape || (key.ctrl && input === 'c') || input === '?' || key.return) {
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
      setStatus('🧹 Screen cleared');
      setTimeout(() => setStatus(''), 1500);
      return;
    }
    if (input === '?' && !showHelp) {
      if (!isLoading) setShowHelp(true);
      return;
    }
    if (key.ctrl && input === 'd' && editorRef.current?.value === '') {
      exit();
      return;
    }
    // Ctrl+R: recall last recent input
    if (key.ctrl && input === 'r' && inputHistory.length > 0) {
      const recallText = inputHistory[inputHistory.length - 1] ?? '';
      editorRef.current?.setValue(recallText);
      setStatus(`📋 Recalled: "${recallText.slice(0, 40)}${recallText.length > 40 ? '…' : ''}"`);
      setTimeout(() => setStatus(''), 2000);
      return;
    }
    // Ctrl+S: save session (quick status update)
    if (key.ctrl && input === 's') {
      setStatus('💾 Session auto-saved');
      setTimeout(() => setStatus(''), 2000);
      // Future: implement actual session save
      return;
    }
    // Ctrl+N: new conversation
    if (key.ctrl && input === 'n') {
      agent.clearHistory();
      setMessages([]);
      setStatus('🆕 New conversation started');
      setTimeout(() => setStatus(''), 2000);
      return;
    }
  });

  // Streaming agent events with 60fps debounce
  useStreamingAgent({
    agent,
    setStreamingText,
    setToolCalls,
    setToolResults,
    setToolProgress,
    setAgentContext,
    setPermissionRequest,
    setStatus,
    setErrorMessage,
    setMessages,
    setIsLoading,
    setIsThinking,
    setReasoningText,
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
      const timestamp = new Date().toISOString();
      setMessages((prev) => [...prev, { role: 'user', content: trimmed, timestamp }]);
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
      {/* Header with context */}
      <Box marginBottom={1} borderStyle="round" borderColor={theme.header} paddingX={1}>
        <Text bold color={theme.header}>
          🍏 McAgent{' '}
        </Text>
        <Text color={theme.muted}>
          ?=help ↑↓=history ⌃R=recall ⌃N=new ⌃S=save
        </Text>
        {toolProgress && toolProgress.progress !== null && (
          <Text color={theme.progressBar}>
            {' ['}{'█'.repeat(Math.floor(toolProgress.progress / 10))}{'░'.repeat(10 - Math.floor(toolProgress.progress / 10))}{'] '}{toolProgress.progress}%
          </Text>
        )}
        {isThinking && (
          <Text color={theme.thinkingSpinner}>
            {' 💭'} thinking
          </Text>
        )}
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
        isThinking={isThinking}
        reasoningText={reasoningText}
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
          <Box key="help-line-editing" flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Line Editing
            </Text>
            <Text key="help-le1" color={theme.muted}> Ctrl+A/E  Beginning/end of line</Text>
            <Text key="help-le2" color={theme.muted}> Alt+B/F   Backward/forward one word</Text>
            <Text key="help-le3" color={theme.muted}> Ctrl+K/U/W Cut to end/start/previous word</Text>
            <Text key="help-le4" color={theme.muted}> Ctrl+Y    Paste last cut text</Text>
          </Box>
          <Box key="help-navigation" flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Navigation
            </Text>
            <Text key="help-nav1" color={theme.muted}> PgUp/PgDn Scroll message history</Text>
            <Text key="help-nav2" color={theme.muted}> Home/End  Jump to top/bottom</Text>
            <Text key="help-nav3" color={theme.muted}> ↑/↓       Browse input history</Text>
          </Box>
          <Box key="help-actions" flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Actions
            </Text>
            <Text key="help-act1" color={theme.muted}> ?         Show this help</Text>
            <Text key="help-act2" color={theme.muted}> Ctrl+L    Clear screen</Text>
            <Text key="help-act3" color={theme.muted}> Ctrl+R    Recall last input</Text>
            <Text key="help-act4" color={theme.muted}> Ctrl+N    New conversation</Text>
            <Text key="help-act5" color={theme.muted}> Ctrl+S    Save session (auto-save)</Text>
            <Text key="help-act6" color={theme.muted}> Ctrl+C    Quit</Text>
            <Text key="help-act7" color={theme.muted}> Ctrl+D    Quit (when input is empty)</Text>
            <Text key="help-act8" color={theme.muted}> Enter     Confirm permission / send message</Text>
            <Text key="help-act9" color={theme.muted}> Esc       Dismiss overlay / deny permission</Text>
          </Box>
          <Box key="help-commands" flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Slash Commands
            </Text>
            <Text key="help-sc1" color={theme.muted}> /mode     Switch permission mode</Text>
            <Text key="help-sc2" color={theme.muted}> /clear    Clear conversation</Text>
            <Text key="help-sc3" color={theme.muted}> /help     Show this help</Text>
            <Text key="help-sc4" color={theme.muted}> /status   Show agent status</Text>
            <Text key="help-sc5" color={theme.muted}> /version  Show version info</Text>
            <Text key="help-sc6" color={theme.muted}> /tools    List active tools</Text>
          </Box>
          <Box key="help-tips" flexDirection="column" marginBottom={1}>
            <Text bold color={theme.heading}>
              Pro Tips
            </Text>
            <Text key="help-tip1" color={theme.muted}> {'  '}• Use /mode auto to skip permission prompts for safe commands</Text>
            <Text key="help-tip2" color={theme.muted}> {'  '}• Use /mode readonly when you only want me to inspect, not modify</Text>
            <Text key="help-tip3" color={theme.muted}> {'  '}• Press ? at any time to reopen this help</Text>
            <Text key="help-tip4" color={theme.muted}> {'  '}• Long operations ({'>'}2s) show a progress bar automatically</Text>
          </Box>
          <Box key="help-colors" flexDirection="column">
            <Text bold color={theme.heading}>
              Color Key
            </Text>
            <Box>
              <Text key="color-user" color={theme.userLabel}>&#x25CF; User</Text>
              <Text key="color-space1"> </Text>
              <Text key="color-assistant" color={theme.assistantLabel}>&#x25CF; Assistant</Text>
              <Text key="color-space2"> </Text>
              <Text key="color-tool" color={theme.toolCall}>&#x25CF; Tool</Text>
              <Text key="color-space3"> </Text>
              <Text key="color-progress" color={theme.toolRunning}>&#x25CF; Progress</Text>
              <Text key="color-space4"> </Text>
              <Text key="color-error" color={theme.error}>&#x25CF; Error</Text>
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
      setStatus('✅ Conversation cleared');
      setTimeout(() => setStatus(''), 2000);
      break;
    case '/help':
      setStatus('Press ? to show help');
      setTimeout(() => setStatus(''), 2000);
      break;
    case '/status': {
      const mode = agent.getPermissionMode();
      const msgCount = agent.getMessages().length;
      const toolCount = agent.getToolCount();
      setStatus(
        `📊 Mode: ${mode} | Model: ${agent.model} | Messages: ${msgCount} | Tools: ${toolCount}`
      );
      setTimeout(() => setStatus(''), 5000);
      break;
    }
    case '/version':
      setStatus('🍏 McAgent v2.5.0 — DeepSeek-powered macOS AI assistant');
      setTimeout(() => setStatus(''), 4000);
      break;
    case '/tools': {
      const toolList = agent.getToolNames().join(', ');
      const toolCount = agent.getToolCount();
      setStatus(`🔧 Tools (${toolCount}): ${toolList.slice(0, 120)}`);
      setTimeout(() => setStatus(''), 5000);
      break;
    }
    default:
      setErrorMessage(
        `Unknown command: ${command}. Try /mode, /clear, /help, /status, /version, or /tools`
      );
      setTimeout(() => setErrorMessage(''), 3000);
  }
}

render(<App />);
