/**
 * HeadlessRenderer — structured CLI output for McAgent headless mode.
 *
 * Provides:
 *  - Terminal width detection & text wrapping
 *  - Colored separators and section markers
 *  - Structured tool result display (success/failure/progress)
 *  - Error / exception formatting
 *  - ASCII spinner animation
 */

import { createAnsiTheme, type AnsiColors } from './ansi-theme.js';

// ─── Terminal helper ─────────────────────────────────────────────────────────

/** Get usable terminal width (with a sensible fallback). */
export function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}

/** Strip ANSI escape codes from a string for accurate length measurement (cached regex). */
const ANSI_STRIP_RE = /\x1b\[[\d;]*m/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_STRIP_RE, '');
}

/**
 * Pre-allocate result buffer for wrapText to reduce GC pressure.
 * Using a reusable pool for common cases.
 */
const WRAP_RESULT_POOL_SIZE = 4;
const wrapResultPool: string[][] = [];
for (let i = 0; i < WRAP_RESULT_POOL_SIZE; i++) {
  wrapResultPool.push([]);
}
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
    const truncated = visible.slice(0, width - 1) + '…';
    return text.endsWith('\x1b[0m') ? truncated + '\x1b[0m' : truncated;
  }
  const pad = ' '.repeat(width - len);
  return align === 'left' ? text + pad : pad + text;
}

/** Wrap text to fit within a given width, respecting ANSI codes. */
export function wrapText(text: string, width: number): string[] {
  const lines = acquireResultBuffer();
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    const visible = stripAnsi(para);
    if (visible.length === 0) {
      lines.push('');
      continue;
    }
    if (visible.length <= width) {
      lines.push(para);
      continue;
    }

    // Word-wrap — single pass with cached visible lengths
    const words = para.split(/(\s+)/);
    let current = '';
    let currentVisible = '';

    for (const word of words) {
      const wordVisible = stripAnsi(word);
      if (currentVisible.length + wordVisible.length > width) {
        if (current) lines.push(current);
        current = word;
        currentVisible = wordVisible;
      } else {
        current += word;
        currentVisible += wordVisible;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
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

// ─── Section header ──────────────────────────────────────────────────────────

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

const STATUS_ICONS: Record<ToolDisplayResult['status'], string> = {
  running: '⟳',
  success: '✓',
  failure: '✗',
  skipped: '–',
};

/** Render a single tool call result line. */
export function renderToolResult(c: AnsiColors, result: ToolDisplayResult): string {
  const icon = STATUS_ICONS[result.status];
  const colorMap: Record<ToolDisplayResult['status'], string> = {
    running: c.warning,
    success: c.success,
    failure: c.error,
    skipped: c.muted,
  };
  const color = colorMap[result.status];
  const duration = result.durationMs !== undefined
    ? ` ${c.muted}(${formatDuration(result.durationMs)})${c.reset}`
    : '';
  const preview = result.preview
    ? ` ${c.dim}${result.preview.length > 60 ? result.preview.slice(0, 60) + '…' : result.preview}${c.reset}`
    : '';

  return `  ${color}${icon}${c.reset} ${c.bold}${result.name}${c.reset}${duration}${preview}`;
}

/** Render a table of tool results (e.g., after a batch). */
export function renderToolResults(c: AnsiColors, results: ToolDisplayResult[]): string {
  if (results.length === 0) return '';

  const lines = results.map((r) => renderToolResult(c, r));
  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failure').length;
  const summary = `  ${c.muted}── ${succeeded} succeeded, ${failed} failed ──${c.reset}`;

  return [...lines, summary].join('\n');
}

// ─── Error display ───────────────────────────────────────────────────────────

/** Format an error with a clear visual structure. */
export function formatError(c: AnsiColors, error: Error, context?: string): string {
  const width = terminalWidth();
  const lines: string[] = [];

  // Error header
  const errLabel = `${c.error}${c.bold}✗ Error${c.reset}`;
  const divider = c.error + '━'.repeat(4) + c.reset;
  lines.push(`${errLabel} ${divider} ${c.bold}${error.name}${c.reset}`);
  lines.push(`  ${c.error}${error.message}${c.reset}`);

  // Optional context
  if (context) {
    lines.push(`  ${c.dim}Context: ${context}${c.reset}`);
  }

  // Stack trace (dimmed)
  if (error.stack) {
    const stackLines = error.stack.split('\n').slice(1);
    for (const s of stackLines) {
      const trimmed = s.trim();
      if (trimmed) {
        const wrapped = wrapText(`${c.dim}${trimmed}${c.reset}`, width - 4);
        for (const w of wrapped) {
          lines.push(`  ${w}`);
        }
      }
    }
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
export function statusBadge(c: AnsiColors, label: string, status: 'info' | 'ok' | 'warn' | 'error'): string {
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
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  }

  constructor(
    style: SpinnerStyle = 'dots',
    colorCode = '\x1b[33m',
    resetCode = '\x1b[0m'
  ) {
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

    this.intervalId = setInterval(() => { this.render(); }, 80);
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

    process.stdout.write('\r\x1b[K');       // clear line
    process.stdout.write('\x1b[?25h');       // show cursor

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

  private render(): void {
    if (!this.running) return;
    const frames = SPINNER_FRAMES[this.style];
    const frame = frames[this.frameIndex % frames.length];
    this.frameIndex++;

    const maxWidth = terminalWidth() - 4;
    const displayText = this.text.length > maxWidth
      ? this.text.slice(0, maxWidth - 1) + '…'
      : this.text;

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
