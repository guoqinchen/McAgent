/**
 * useTheme — terminal-aware color theme for Ink TUI.
 *
 * Detects light/dark terminal background and returns semantic color tokens
 * that work on both themes. Uses MCAGENT_THEME env var for explicit override,
 * falls back to dark theme when detection is unavailable.
 */

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light';

export interface ThemeTokens {
  /** User message label color */
  userLabel: string;
  /** Assistant message label color */
  assistantLabel: string;
  /** System message label color */
  systemLabel: string;
  /** User message content text */
  userText: string;
  /** Assistant message content text */
  assistantText: string;
  /** Tool call display color */
  toolCall: string;
  /** Tool name label */
  toolName: string;
  /** Tool status indicator (pending) */
  toolPending: string;
  /** Tool status indicator (running) */
  toolRunning: string;
  /** Tool status indicator (success) */
  toolSuccess: string;
  /** Tool status indicator (error) */
  toolError: string;
  /** Tool execution duration */
  toolDuration: string;
  /** Input prompt color */
  inputPrompt: string;
  /** Border color */
  border: string;
  /** Status text color */
  status: string;
  /** Error text color */
  error: string;
  /** Error hint/recovery text */
  errorHint: string;
  /** Muted / dim text */
  muted: string;
  /** Header color */
  header: string;
  /** Streaming cursor indicator */
  streamingIndicator: string;
  /** Streaming typewriter cursor */
  streamingCursor: string;
  /** Scroll position indicator */
  scrollIndicator: string;
  /** Message separator line */
  messageSeparator: string;
  /** Thinking state spinner */
  thinkingSpinner: string;
  /** Thinking state label */
  thinkingLabel: string;
  /** Thinking elapsed timer */
  thinkingTimer: string;
  /** Markdown heading */
  heading: string;
  /** Markdown heading level indicator (decorative) */
  headingDecorator: string;
  /** Markdown code block background */
  codeBlock: string;
  /** Markdown code block language label */
  codeLang: string;
  /** Inline code */
  inlineCode: string;
  /** Hyperlinks / URLs */
  link: string;
  /** List markers (bullet, number) */
  listMarker: string;
  /** Blockquote bar/indicator */
  blockquote: string;
  /** Horizontal rule */
  hr: string;
  /** Success / confirmation messages */
  success: string;
  /** Warning messages */
  warning: string;
  /** Progress bar fill */
  progressBar: string;
  /** Progress bar background */
  progressBg: string;
  /** Permission highlight (for permission prompts) */
  permissionHighlight: string;
  /** Reasoning / thinking text */
  reasoning: string;
  /** Reasoning label */
  reasoningLabel: string;
  /** Table header */
  tableHeader: string;
  /** Table border */
  tableBorder: string;
  /** Keyword highlight */
  keyword: string;
  /** Number highlight (in code) */
  number: string;
  /** Comment highlight (in code) */
  comment: string;
  /** String highlight (in code) */
  string: string;
  /** Function name highlight (in code) */
  function: string;
  /** Type/class highlight (in code) */
  type: string;
}

// ─── Color palettes ───────────────────────────────────────────────────────────

const darkTokens: ThemeTokens = {
  userLabel: 'cyan',
  assistantLabel: 'green',
  systemLabel: 'yellow',
  userText: 'white',
  assistantText: 'white',
  toolCall: 'yellow',
  toolName: 'yellowBright',
  toolPending: 'gray',
  toolRunning: 'yellow',
  toolSuccess: 'greenBright',
  toolError: 'redBright',
  toolDuration: 'gray',
  inputPrompt: 'yellow',
  border: 'gray',
  status: 'gray',
  error: 'redBright',
  errorHint: 'yellowBright',
  muted: 'gray',
  header: 'magenta',
  streamingIndicator: 'gray',
  streamingCursor: 'green',
  scrollIndicator: 'gray',
  messageSeparator: 'gray',
  thinkingSpinner: 'cyan',
  thinkingLabel: 'cyan',
  thinkingTimer: 'gray',
  heading: 'cyanBright',
  headingDecorator: 'gray',
  codeBlock: 'cyan',
  codeLang: 'gray',
  inlineCode: 'yellow',
  link: 'blueBright',
  listMarker: 'gray',
  blockquote: 'gray',
  hr: 'gray',
  success: 'greenBright',
  warning: 'yellowBright',
  progressBar: 'green',
  progressBg: 'gray',
  permissionHighlight: 'yellow',
  reasoning: 'gray',
  reasoningLabel: 'cyan',
  tableHeader: 'cyanBright',
  tableBorder: 'gray',
  keyword: 'magenta',
  number: 'yellow',
  comment: 'gray',
  string: 'green',
  function: 'yellowBright',
  type: 'cyanBright',
};

const lightTokens: ThemeTokens = {
  userLabel: 'blueBright',
  assistantLabel: 'green',
  systemLabel: 'yellow',
  userText: 'black',
  assistantText: 'black',
  toolCall: 'yellow',
  toolName: 'yellow',
  toolPending: 'gray',
  toolRunning: 'yellow',
  toolSuccess: 'green',
  toolError: 'redBright',
  toolDuration: 'gray',
  inputPrompt: 'yellow',
  border: 'gray',
  status: 'gray',
  error: 'redBright',
  errorHint: 'yellow',
  muted: 'gray',
  header: 'magentaBright',
  streamingIndicator: 'gray',
  streamingCursor: 'greenBright',
  scrollIndicator: 'gray',
  messageSeparator: 'gray',
  thinkingSpinner: 'blue',
  thinkingLabel: 'blue',
  thinkingTimer: 'gray',
  heading: 'blueBright',
  headingDecorator: 'gray',
  codeBlock: 'blue',
  codeLang: 'gray',
  inlineCode: 'magenta',
  link: 'blue',
  listMarker: 'gray',
  blockquote: 'gray',
  hr: 'gray',
  success: 'green',
  warning: 'yellow',
  progressBar: 'green',
  progressBg: 'gray',
  permissionHighlight: 'yellowBright',
  reasoning: 'gray',
  reasoningLabel: 'blue',
  tableHeader: 'blueBright',
  tableBorder: 'gray',
  keyword: 'magenta',
  number: 'yellow',
  comment: 'gray',
  string: 'green',
  function: 'yellow',
  type: 'blueBright',
};

// ─── Detection ────────────────────────────────────────────────────────────────

/** Detect terminal background preference. */
export function detectThemeMode(): ThemeMode {
  // Explicit override via env var
  const envTheme = process.env.MCAGENT_THEME;
  if (envTheme === 'light') return 'light';
  if (envTheme === 'dark') return 'dark';

  // COLORFGBG env var: "15;0" = light fg on dark bg, "0;15" = dark fg on light bg
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    if (parts.length === 2 && parts[1] !== undefined) {
      const bgCode = parseInt(parts[1], 10);
      // ANSI color codes 0-7 are dark, 8-15 are light
      return bgCode >= 8 ? 'light' : 'dark';
    }
  }

  // Default: dark (matches most developer terminals)
  return 'dark';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeTokens & { mode: ThemeMode } {
  const mode = useMemo(() => detectThemeMode(), []);
  const tokens = useMemo(() => (mode === 'light' ? lightTokens : darkTokens), [mode]);

  return { ...tokens, mode };
}
