/**
 * ANSI theme — shared color constants for headless CLI output.
 *
 * Maps Ink theme tokens to ANSI escape codes, ensuring visual consistency
 * between the TUI (Ink) and headless (ANSI) interfaces.
 */

import { detectThemeMode, type ThemeMode } from './hooks/use-theme.js';

export interface AnsiColors {
  reset: string;
  bold: string;
  dim: string;
  userLabel: string;
  assistantLabel: string;
  systemLabel: string;
  userText: string;
  assistantText: string;
  toolCall: string;
  toolName: string;
  toolPending: string;
  toolRunning: string;
  toolSuccess: string;
  toolError: string;
  toolDuration: string;
  inputPrompt: string;
  border: string;
  status: string;
  error: string;
  errorHint: string;
  muted: string;
  header: string;
  streamingIndicator: string;
  streamingCursor: string;
  scrollIndicator: string;
  messageSeparator: string;
  thinkingSpinner: string;
  thinkingLabel: string;
  thinkingTimer: string;
  heading: string;
  headingDecorator: string;
  codeBlock: string;
  codeLang: string;
  inlineCode: string;
  link: string;
  listMarker: string;
  blockquote: string;
  hr: string;
  success: string;
  warning: string;
  reasoning: string;
  reasoningLabel: string;
  tableHeader: string;
  tableBorder: string;
  keyword: string;
  number: string;
  comment: string;
  string: string;
  function: string;
  type: string;
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
  const code = ansiColorMap[inkColor];
  if (code === undefined) {
    // Fallback to white for unrecognized colors to avoid unclosed ANSI sequences
    console.warn(`Unknown ANSI color token: "${inkColor}", falling back to white`);
    return ansiColorMap.white ?? '\\x1b[37m';
  }
  return code;
}

export function createAnsiTheme(mode?: ThemeMode): AnsiColors {
  const themeMode = mode || detectThemeMode();

  const tokens: Record<string, string> =
    themeMode === 'light'
      ? {
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
        }
      : {
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

  const colors: Record<string, string> = {};
  for (const [key, inkColor] of Object.entries(tokens)) {
    colors[key] = inkToAnsi(inkColor);
  }

  const allKeys: (keyof AnsiColors)[] = [
    'reset', 'bold', 'dim',
    'userLabel', 'assistantLabel', 'systemLabel',
    'userText', 'assistantText',
    'toolCall', 'toolName', 'toolPending', 'toolRunning',
    'toolSuccess', 'toolError', 'toolDuration',
    'inputPrompt', 'border', 'status', 'error', 'errorHint',
    'muted', 'header',
    'streamingIndicator', 'streamingCursor',
    'scrollIndicator', 'messageSeparator',
    'thinkingSpinner', 'thinkingLabel', 'thinkingTimer',
    'heading', 'headingDecorator',
    'codeBlock', 'codeLang', 'inlineCode',
    'link', 'listMarker', 'blockquote', 'hr',
    'success', 'warning',
    'reasoning', 'reasoningLabel',
    'tableHeader', 'tableBorder',
    'keyword', 'number', 'comment', 'string', 'function', 'type',
  ];

  const result: Record<string, string> = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
  };

  for (const key of allKeys) {
    if (key === 'reset' || key === 'bold' || key === 'dim') continue;
    result[key] = colors[key] || '';
  }

  return result as unknown as AnsiColors;
}
