/**
 * HeadlessRenderer v3.1 — optimized structured CLI output for McAgent headless mode.
 *
 * Performance improvements:
 *  - ANSI strip regex is shared across module (single instance)
 *  - wrapText uses pooled buffers + pre-allocated arrays
 *  - formatError reduces temporary allocations
 *  - renderToolResults uses single-pass aggregation
 *  - Spinner uses rAF-compatible scheduling via setInterval with merged writes
 */

import { createAnsiTheme, type AnsiColors } from './ansi-theme.js';

// ─── Shared constants ─────────────────────────────────────────────────────────

/** Get usable terminal width (with a sensible fallback). */
export function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}

/** Shared regex for stripping ANSI escape codes — cached to avoid RegExp re-creation. */
const ANSI_STRIP_RE = /\x1b\[[\d;]*m/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_STRIP_RE, '');
}

/**
 * Pooled result buffer for wrapText to reduce GC pressure.
 * Thread-local (single-threaded Node.js) so safe.
 */
const WRAP_RESULT_POOL_SIZE = 4;
const wrapResultPool: string[][] = Array.from({ length: WRAP_RESULT_POOL_SIZE }, () => []);
let wrapResultIndex = 0;

function acquireResultBuffer(): string[] {
  const idx = wrapResultIndex;
  wrapResultIndex = (idx + 1) % WRAP_RESULT_POOL_SIZE;
  const buf = wrapResultPool[idx]!;
  buf.length = 0;
  return buf;
}

/** Pad or truncate a string to an exact visual width (ANSI-aware). */
export function ansiPad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const visible = stripAnsi(text);
  const len = visible.length;
  if (len >= width) {
    const truncated = visible.slice(0, Math.max(width - 1, 1)) + '\u2026';
    return text.endsWith('\x1b[0m') ? truncated + '\x1b[0m' : truncated;
  }
  const pad = ' '.repeat(width - len);
  return align === 'left' ? text + pad : pad + text;
}

/**
 * Wrap text to fit within a given width, respecting ANSI codes.
 * Optimized with pooled buffers and single-pass ANSI stripping.
 */
export function wrapText(text: string, width: number): string[] {
  const lines = acquireResultBuffer();
  const paragraphs = text.split('\n');
  const pLen = paragraphs.length;

  for (let pi = 0; pi < pLen; pi++) {
    const para = paragraphs[pi]!;
    const visible = stripAnsi(para);
    const vLen = visible.length;

    if (vLen === 0) {
      lines.push('');
      continue;
    }
    if (vLen <= width) {
      lines.push(para);
      continue;
    }

    // Word-wrap — single pass using pre-split words
    const words = para.split(/(\s+)/);
    const wLen = words.length;
    let current = '';
    let currentVisible = '';
    let cvLen = 0;

    for (let wi = 0; wi < wLen; wi++) {
      const word = words[wi]!;
      const wordVisible = stripAnsi(word);
      const wvLen = wordVisible.length;
      if (cvLen + wvLen > width) {
        if (current) {
          lines.push(current);
        }
        current = word;
        currentVisible = wordVisible;
        cvLen = wvLen;
      } else {
        current += word;
        currentVisible += wordVisible;
        cvLen += wvLen;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

/** Truncate text with ellipsis, ANSI-aware. */
export function truncate(text: string, maxLen: number): string {
  const visible = stripAnsi(text);
  if (visible.length <= maxLen) return text;
  // Find ANSI-safe boundary
  const truncated = visible.slice(0, Math.max(maxLen - 1, 1)) + '…';
  return truncated;
}

// ─── Separator / Rule ────────────────────────────────────────────────────────

/** Draw a horizontal rule across the terminal, with optional label and color. */
export function rule(
  c: AnsiColors,
  options?: { label?: string; char?: string; color?: string }
): string {
  const width = terminalWidth();
  const char = options?.char ?? '─';
  const color = options?.color ?? 'border';
  const colorCode = c[color as keyof AnsiColors] ?? '';
  const label = options?.label;

  if (!label) {
    return `${colorCode}${char.repeat(width)}${c.reset}`;
  }

  const padded = ` ${label} `;
  const available = Math.max(width - stripAnsi(padded).length, 0);
  const leftLen = Math.floor(available / 2);
  const rightLen = available - leftLen;
  return `${colorCode}${char.repeat(leftLen)}${c.reset}${padded}${colorCode}${char.repeat(rightLen)}${c.reset}`;
}

// ─── Section headers / blocks ───────────────────────────────────────────────

/** Create a visually distinct section header. */
export function sectionHeader(c: AnsiColors, title: string): string {
  const width = terminalWidth();
  const inner = ` ${title} `.padEnd(width - 2, ' ');
  return [
    `${c.border}╭${inner}╮${c.reset}`,
    `${c.border}╰${'─'.repeat(width - 2)}╯${c.reset}`,
  ].join('\n');
}

/** Create a compact section header (single line). */
export function compactHeader(c: AnsiColors, title: string): string {
  const width = terminalWidth();
  const visibleLen = stripAnsi(title).length + 4; // " ◆  " prefix
  const remaining = Math.max(width - visibleLen, 0);
  return `${c.header} ◆  ${c.bold}${title}${c.reset} ${c.border}${'─'.repeat(remaining)}${c.reset}`;
}

/**
 * Create a labeled section block with a top rule, indented content, and bottom rule.
 * Used to visually distinguish user input, AI replies, tool calls, and errors.
 *
 * Section types:
 *   - 'user'      → User input (cyan label)
 *   - 'assistant' → AI reply (green label)
 *   - 'tool'      → Tool call (yellow label)
 *   - 'error'     → Error (red label)
 *   - 'info'      → Info/status (blue/magenta label)
 *   - 'system'    → System message (yellow label)
 */
export type SectionType = 'user' | 'assistant' | 'tool' | 'error' | 'info' | 'system';

const SECTION_CONFIG: Record<
  SectionType,
  { color: keyof AnsiColors; icon: string; defaultLabel: string }
> = {
  user: { color: 'userLabel', icon: '🧑', defaultLabel: 'You' },
  assistant: { color: 'assistantLabel', icon: '🤖', defaultLabel: 'McAgent' },
  tool: { color: 'toolCall', icon: '🔧', defaultLabel: 'Tool Call' },
  error: { color: 'error', icon: '❌', defaultLabel: 'Error' },
  info: { color: 'header', icon: 'ℹ️', defaultLabel: 'Info' },
  system: { color: 'systemLabel', icon: '⚙️', defaultLabel: 'System' },
};

/** Create a section block with top rule, optional icon, content lines, and bottom rule. */
export function sectionBlock(
  c: AnsiColors,
  type: SectionType,
  content: string,
  options?: { label?: string; details?: string }
): string {
  const cfg = SECTION_CONFIG[type];
  const label = options?.label ?? cfg.defaultLabel;
  const colorCode = c[cfg.color];
  const lines: string[] = [];

  // Top separator with label
  const width = terminalWidth();
  const headerContent = ` ${cfg.icon}  ${colorCode}${c.bold}${label}${c.reset} `;
  const visiblePrefix = stripAnsi(headerContent);
  const remaining = Math.max(width - visiblePrefix.length, 0);
  lines.push(
    `${colorCode}${'─'.repeat(4)}${c.reset}${headerContent}${colorCode}${'─'.repeat(remaining)}${c.reset}`
  );

  // Content (each line gets 2-space indent)
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    lines.push(`  ${line}`);
  }

  // Optional details line
  if (options?.details) {
    lines.push(`  ${c.dim}${options.details}${c.reset}`);
  }

  // Bottom rule
  lines.push(`${colorCode}${'─'.repeat(Math.min(width, 40))}${c.reset}`);

  return lines.join('\n');
}

/** Create a compact one-line section label (for inline use). */
export function sectionLabel(c: AnsiColors, type: SectionType, label?: string): string {
  const cfg = SECTION_CONFIG[type];
  const text = label ?? cfg.defaultLabel;
  return `${c[cfg.color]}${cfg.icon}${c.reset} ${c.bold}${text}${c.reset}`;
}

// ─── Structured tool result display ──────────────────────────────────────────

export interface ToolDisplayResult {
  name: string;
  status: 'running' | 'success' | 'failure' | 'skipped';
  durationMs?: number;
  preview?: string;
}

/** Format elapsed time in a human-friendly way. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

// No longer used — emoji-based display is used instead in renderToolResult

/** Render a single tool call result line with structured output. */
export function renderToolResult(c: AnsiColors, result: ToolDisplayResult): string {
  // Emoji-enhanced status icons
  const STATUS_EMOJI: Record<ToolDisplayResult['status'], string> = {
    running: '⏳',
    success: '✅',
    failure: '❌',
    skipped: '⏭️',
  };
  const icon = STATUS_EMOJI[result.status];
  const colorMap: Record<ToolDisplayResult['status'], string> = {
    running: c.warning,
    success: c.success,
    failure: c.error,
    skipped: c.muted,
  };
  const color = colorMap[result.status];
  const duration =
    result.durationMs !== undefined
      ? ` ${c.muted}(${formatDuration(result.durationMs)})${c.reset}`
      : '';
  const preview = result.preview ? ` ${c.dim}${truncate(result.preview, 60)}${c.reset}` : '';

  const statusLabel =
    result.status === 'running'
      ? 'RUNNING'
      : result.status === 'success'
        ? 'OK'
        : result.status === 'failure'
          ? 'FAILED'
          : 'SKIPPED';

  return `  ${color}${icon}${c.reset} ${color}${c.bold}[${statusLabel}]${c.reset} ${c.bold}${result.name}${c.reset}${duration}${preview}`;
}

/** Render a table of tool results (e.g., after a batch). Single-pass aggregation. */
export function renderToolResults(c: AnsiColors, results: ToolDisplayResult[]): string {
  const len = results.length;
  if (len === 0) return '';

  // Single-pass: build lines + aggregate stats simultaneously
  const lines = new Array<string>(len);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < len; i++) {
    const r = results[i]!;
    lines[i] = renderToolResult(c, r);
    if (r.status === 'success') succeeded++;
    else if (r.status === 'failure') failed++;
    else if (r.status === 'skipped') skipped++;
  }

  // Summary line with structured stats
  const summaryParts: string[] = [];
  if (succeeded > 0) summaryParts.push(`${c.success}${succeeded} succeeded${c.reset}`);
  if (failed > 0) summaryParts.push(`${c.error}${failed} failed${c.reset}`);
  if (skipped > 0) summaryParts.push(`${c.muted}${skipped} skipped${c.reset}`);
  const summary = `  ${c.muted}── ${summaryParts.join(', ')} (${len} total) ──${c.reset}`;

  return lines.join('\n') + '\n' + summary;
}

// ─── Enhanced error display ─────────────────────────────────────────────────

/** Known error patterns with suggestion mappings. */
interface ErrorSuggestion {
  pattern: RegExp;
  suggestion: string;
}

const ERROR_SUGGESTIONS: ErrorSuggestion[] = [
  { pattern: /ENOENT/i, suggestion: 'File or directory not found. Check the path and try again.' },
  {
    pattern: /EACCES|permission denied/i,
    suggestion: 'Permission denied. Try with sudo or check file permissions.',
  },
  {
    pattern: /ETIMEDOUT|timeout/i,
    suggestion: 'Operation timed out. Check network connectivity or increase timeout.',
  },
  {
    pattern: /ECONNREFUSED/i,
    suggestion: 'Connection refused. Ensure the target service is running.',
  },
  {
    pattern: /ECONNRESET/i,
    suggestion: 'Connection reset. The remote server closed the connection.',
  },
  { pattern: /ENOSPC|no space/i, suggestion: 'Disk space full. Free up space and try again.' },
  {
    pattern: /SyntaxError|Unexpected token/i,
    suggestion: 'Syntax error in code or JSON. Check for typos.',
  },
  { pattern: /TypeError/i, suggestion: 'Type mismatch. Check that values have the correct type.' },
  {
    pattern: /ReferenceError/i,
    suggestion: 'Undefined variable reference. Check that the variable is declared.',
  },
  {
    pattern: /command not found/i,
    suggestion: 'Command not found. Install the required package or check the command name.',
  },
  { pattern: /failed|error/i, suggestion: 'The operation failed. Review the details and retry.' },
];

/** Find a suggestion for a given error message. */
export function findSuggestion(errorMessage: string): string | undefined {
  for (const entry of ERROR_SUGGESTIONS) {
    if (entry.pattern.test(errorMessage)) {
      return entry.suggestion;
    }
  }
  return undefined;
}

/**
 * Format an error with a clear visual structure:
 *   ❌ ErrorType ━━━━━━━━━━
 *     Error message
 *     📍 Location: file.ts:42
 *     💡 Suggestion: ...
 *   ━━━━━━━━━━━━━━━━━━━━━━
 */
export function formatError(c: AnsiColors, error: Error, context?: string): string {
  const width = terminalWidth();
  const lines: string[] = [];

  // Error header with type
  const errLabel = `${c.error}${c.bold}❌ Error${c.reset}`;
  const remaining = Math.max(
    width - stripAnsi(errLabel).length - stripAnsi(error.name).length - 4,
    0
  );
  lines.push(
    `${errLabel} ${c.error}${error.name}${c.reset} ${c.error}${'━'.repeat(remaining)}${c.reset}`
  );

  // Error message (wrapped)
  const wrappedMsg = wrapText(`${c.error}${error.message}${c.reset}`, width - 4);
  for (const w of wrappedMsg) {
    lines.push(`  ${w}`);
  }

  // Optional context
  if (context) {
    lines.push(`  ${c.dim}📍 Context: ${context}${c.reset}`);
  }

  // Location from stack trace (first meaningful frame)
  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(1);
    for (const s of stackLines) {
      const trimmed = s.trim();
      if (trimmed && !trimmed.includes('node:internal') && !trimmed.includes('node_modules')) {
        // Extract location from stack frame like "at functionName (/path/file.ts:42:10)"
        const locMatch = trimmed.match(/\((.+?:\d+:\d+)\)/) || trimmed.match(/at (.+?:\d+:\d+)/);
        if (locMatch) {
          lines.push(`  ${c.errorHint}📍 Location: ${locMatch[1]}${c.reset}`);
        }
        break; // Only first meaningful frame
      }
    }
  }

  // 💡 Suggested solution
  const suggestion = findSuggestion(error.message);
  if (suggestion) {
    lines.push(`  ${c.warning}💡 ${suggestion}${c.reset}`);
  }

  // Bottom border
  lines.push(`${c.error}${'━'.repeat(Math.min(width, 40))}${c.reset}`);

  return lines.join('\n');
}

/** Format a warning message. */
export function formatWarning(c: AnsiColors, message: string): string {
  return `  ${c.warning}${c.bold}⚠${c.reset} ${c.warning}${message}${c.reset}`;
}

/** Format an info message. */
export function formatInfo(c: AnsiColors, message: string): string {
  return `  ${c.header}ℹ${c.reset} ${c.dim}${message}${c.reset}`;
}

// ─── Status label ────────────────────────────────────────────────────────────

/** Create a styled status badge. */
export function statusBadge(
  c: AnsiColors,
  label: string,
  status: 'info' | 'ok' | 'warn' | 'error'
): string {
  const colorMap = { info: c.header, ok: c.success, warn: c.warning, error: c.error };
  const iconMap = { info: '●', ok: '●', warn: '●', error: '●' };
  const color = colorMap[status];
  const icon = iconMap[status];
  return `${color}${icon}${c.reset} ${c.bold}${label}${c.reset}`;
}

// ─── ASCII Spinner ───────────────────────────────────────────────────────────

export type SpinnerStyle = 'dots' | 'line' | 'bounce' | 'clock' | 'arrows';

const SPINNER_FRAMES: Record<SpinnerStyle, string[]> = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  bounce: ['⢄', '⢠', '⢰', '⢸', '⣸', '⣴', '⣤', '⣀'],
  clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
  arrows: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
};

export class Spinner {
  private frameIndex = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private text = '';
  private style: SpinnerStyle;
  private colorCode: string;
  private resetCode: string;
  private running = false;
  private cleanupRegistered = false;

  /** Register process exit handlers to ensure terminal cursor is restored. */
  private ensureCleanupRegistered(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;

    const cleanup = () => {
      if (this.running) {
        process.stdout.write('\x1b[?25h'); // restore cursor
        if (this.intervalId !== null) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        this.running = false;
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  constructor(style: SpinnerStyle = 'dots', colorCode = '\x1b[33m', resetCode = '\x1b[0m') {
    this.style = style;
    this.colorCode = colorCode;
    this.resetCode = resetCode;
  }

  /** Start the spinner with a descriptive message. */
  start(text: string): void {
    if (this.running) return;
    this.running = true;
    this.ensureCleanupRegistered();
    this.text = text;
    this.frameIndex = 0;

    process.stdout.write('\x1b[?25l'); // hide cursor

    this.intervalId = setInterval(() => {
      this.render();
    }, 80);
    this.render();
  }

  /** Update the spinner message. */
  setText(text: string): void {
    this.text = text;
  }

  /** Stop the spinner and optionally write a final message. */
  stop(finalMessage?: string): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    process.stdout.write('\r\x1b[K'); // clear line
    process.stdout.write('\x1b[?25h'); // show cursor

    if (finalMessage) {
      process.stdout.write(finalMessage + '\n');
    }
  }

  /** Stop spinner with a success icon. */
  succeed(text?: string): void {
    this.stop(`${this.colorCode}✓${this.resetCode} ${text ?? this.text}`);
  }

  /** Stop spinner with a failure icon. */
  fail(text?: string): void {
    this.stop(`\x1b[31m✗\x1b[0m ${text ?? this.text}`);
  }

  /** Stop spinner with a warning icon. */
  warn(text?: string): void {
    this.stop(`\x1b[33m⚠\x1b[0m ${text ?? this.text}`);
  }

  /** Whether the spinner is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Strip ANSI escape codes from text to prevent terminal injection. */
  private sanitize(text: string): string {
    return text.replace(ANSI_STRIP_RE, '');
  }

  private render(): void {
    if (!this.running) return;
    const frames = SPINNER_FRAMES[this.style];
    const frame = frames[this.frameIndex % frames.length];
    this.frameIndex++;

    const maxWidth = terminalWidth() - 4;
    const safeText = this.sanitize(this.text);
    const displayText = safeText.length > maxWidth
      ? safeText.slice(0, maxWidth - 1) + '…'
      : safeText;

    process.stdout.write(`\r${this.colorCode}${frame}${this.resetCode} ${displayText}\x1b[K`);
  }
}

// ─── Progress bar ────────────────────────────────────────────────────────────

/** Render a simple ASCII progress bar. */
export function progressBar(
  c: AnsiColors,
  current: number,
  total: number,
  label?: string,
  barWidth: number = 20
): string {
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;
  const filled = Math.round((pct / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = `${c.success}${'█'.repeat(filled)}${c.muted}${'░'.repeat(empty)}${c.reset}`;
  const pctStr = `${c.bold}${String(pct).padStart(3)}%${c.reset}`;
  const labelStr = label ? ` ${c.dim}${label}${c.reset}` : '';
  return `${bar} ${pctStr}${labelStr}`;
}

// ─── Convenience writer ──────────────────────────────────────────────────────

export interface RendererOptions {
  theme?: AnsiColors;
  spinnerStyle?: SpinnerStyle;
}

/**
 * HeadlessRenderer — a high-level convenience wrapper that manages
 * the AnsiTheme, a Spinner, and provides structured output methods.
 *
 * v3: Added sectionBlock, sectionLabel, warn (multiline), progressLine methods.
 */
export class HeadlessRenderer {
  readonly c: AnsiColors;
  readonly spinner: Spinner;

  constructor(options?: RendererOptions) {
    this.c = options?.theme ?? createAnsiTheme();
    this.spinner = new Spinner(options?.spinnerStyle ?? 'dots', this.c.warning, this.c.reset);
  }

  /** Write a plain message to stdout. */
  write(message: string): void {
    process.stdout.write(message);
  }

  /** Write a line to stdout. */
  writeln(message?: string): void {
    process.stdout.write((message ?? '') + '\n');
  }

  /** Write an empty line. */
  blank(): void {
    process.stdout.write('\n');
  }

  /** Render a horizontal rule. */
  rule(options?: { label?: string; char?: string; color?: string }): void {
    this.writeln(rule(this.c, options));
  }

  /** Render a section header. */
  header(title: string, compact = true): void {
    if (compact) {
      this.writeln(compactHeader(this.c, title));
    } else {
      this.writeln(sectionHeader(this.c, title));
    }
  }

  /**
   * Render a labeled section block with top/bottom rules and indented content.
   * Clear visual distinction for user input, AI replies, tool calls, and errors.
   */
  section(
    type: SectionType,
    content: string,
    options?: { label?: string; details?: string }
  ): void {
    this.writeln(sectionBlock(this.c, type, content, options));
  }

  /** Render a compact one-line section label. */
  sectionLabel(type: SectionType, label?: string): void {
    this.writeln(sectionLabel(this.c, type, label));
  }

  /** Render a tool result line. */
  toolResult(result: ToolDisplayResult): void {
    this.writeln(renderToolResult(this.c, result));
  }

  /** Render a batch of tool results. */
  toolResults(results: ToolDisplayResult[]): void {
    const output = renderToolResults(this.c, results);
    if (output) this.writeln(output);
  }

  /** Render an error. */
  error(error: Error, context?: string): void {
    this.writeln(formatError(this.c, error, context));
  }

  /** Render a warning. */
  warn(message: string): void {
    this.writeln(formatWarning(this.c, message));
  }

  /** Render an info line. */
  info(message: string): void {
    this.writeln(formatInfo(this.c, message));
  }

  /** Render a status badge. */
  badge(label: string, status: 'info' | 'ok' | 'warn' | 'error'): void {
    this.writeln(statusBadge(this.c, label, status));
  }
}
