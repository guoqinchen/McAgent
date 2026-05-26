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
  /** Tool call display color */
  toolCall: string;
  /** Input prompt color */
  inputPrompt: string;
  /** Border color */
  border: string;
  /** Status text color */
  status: string;
  /** Error text color */
  error: string;
  /** Muted / dim text */
  muted: string;
  /** Header color */
  header: string;
}

// ─── Color palettes ───────────────────────────────────────────────────────────

const darkTokens: ThemeTokens = {
  userLabel: 'cyan',
  assistantLabel: 'green',
  toolCall: 'yellow',
  inputPrompt: 'yellow',
  border: 'gray',
  status: 'gray',
  error: 'redBright',
  muted: 'gray',
  header: 'magenta',
};

const lightTokens: ThemeTokens = {
  userLabel: 'blueBright',
  assistantLabel: 'green',
  toolCall: 'yellow',
  inputPrompt: 'yellow',
  border: 'gray',
  status: 'gray',
  error: 'redBright',
  muted: 'gray',
  header: 'magentaBright',
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
