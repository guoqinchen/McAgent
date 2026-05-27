/**
 * ANSI theme — shared color constants for headless CLI output.
 *
 * Maps Ink theme tokens to ANSI escape codes, ensuring visual consistency
 * between the TUI (Ink) and headless (ANSI) interfaces.
 */

import { detectThemeMode, type ThemeMode } from './hooks/use-theme.js';

interface AnsiColors {
  reset: string;
  bold: string;
  dim: string;
  userLabel: string;
  assistantLabel: string;
  toolCall: string;
  inputPrompt: string;
  border: string;
  status: string;
  error: string;
  muted: string;
  header: string;
  heading: string;
  codeBlock: string;
  inlineCode: string;
  link: string;
  listMarker: string;
  success: string;
  warning: string;
  reasoning: string;
}

const ansiColorMap: Record<string, string> = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  redBright: '\x1b[91m',
  greenBright: '\x1b[92m',
  yellowBright: '\x1b[93m',
  blueBright: '\x1b[94m',
  magentaBright: '\x1b[95m',
  cyanBright: '\x1b[96m',
  whiteBright: '\x1b[97m',
};

function inkToAnsi(inkColor: string): string {
  return ansiColorMap[inkColor] || '';
}

export function createAnsiTheme(mode?: ThemeMode): AnsiColors {
  const themeMode = mode || detectThemeMode();

  const tokens =
    themeMode === 'light'
      ? {
          userLabel: 'blueBright',
          assistantLabel: 'green',
          toolCall: 'yellow',
          inputPrompt: 'yellow',
          border: 'gray',
          status: 'gray',
          error: 'redBright',
          muted: 'gray',
          header: 'magentaBright',
          heading: 'blueBright',
          codeBlock: 'blue',
          inlineCode: 'magenta',
          link: 'blueBright',
          listMarker: 'gray',
          success: 'green',
          warning: 'yellow',
          reasoning: 'gray',
        }
      : {
          userLabel: 'cyan',
          assistantLabel: 'green',
          toolCall: 'yellow',
          inputPrompt: 'yellow',
          border: 'gray',
          status: 'gray',
          error: 'redBright',
          muted: 'gray',
          header: 'magenta',
          heading: 'cyanBright',
          codeBlock: 'cyan',
          inlineCode: 'yellow',
          link: 'blueBright',
          listMarker: 'gray',
          success: 'greenBright',
          warning: 'yellowBright',
          reasoning: 'gray',
        };

  const colors: Record<string, string> = {};
  for (const [key, inkColor] of Object.entries(tokens)) {
    colors[key] = inkToAnsi(inkColor);
  }

  return {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    userLabel: colors.userLabel || '',
    assistantLabel: colors.assistantLabel || '',
    toolCall: colors.toolCall || '',
    inputPrompt: colors.inputPrompt || '',
    border: colors.border || '',
    status: colors.status || '',
    error: colors.error || '',
    muted: colors.muted || '',
    header: colors.header || '',
    heading: colors.heading || '',
    codeBlock: colors.codeBlock || '',
    inlineCode: colors.inlineCode || '',
    link: colors.link || '',
    listMarker: colors.listMarker || '',
    success: colors.success || '',
    warning: colors.warning || '',
    reasoning: colors.reasoning || '',
  };
}
