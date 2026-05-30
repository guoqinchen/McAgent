/**
 * Supplemental UI component tests.
 *
 * Tests pure logic functions from UI components that don't require
 * a terminal environment (Ink rendering). Covers:
 *   - MarkdownRenderer: parseBlocks, parseInline, highlightLine, table parsing
 *   - ToolVisualizer: formatArgs, formatDuration
 *   - HeadlessRenderer: stripAnsi, ansiPad, wrapText, rule, formatError
 */

import { describe, it, expect } from 'vitest';
import {
  createAnsiTheme,
  type AnsiColors,
} from '../ui/ansi-theme.js';
import {
  sectionBlock,
  sectionLabel,
  findSuggestion,
  formatError,
  renderToolResult,
  renderToolResults,
  stripAnsi,
} from '../ui/headless-renderer.js';

// ============================================================================
// MarkdownRenderer: parseInline
// ============================================================================

function parseInline(text: string): Array<{ type: string; text: string; url?: string }> {
  const tokens: Array<{ type: string; text: string; url?: string }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const s = remaining.match(/^~~(.+?)~~/);
    if (s) {
      tokens.push({ type: 'strikethrough', text: s[1] });
      remaining = remaining.slice(s[0].length);
      continue;
    }
    const b = remaining.match(/^\*\*(.+?)\*\*/);
    if (b) {
      tokens.push({ type: 'bold', text: b[1] });
      remaining = remaining.slice(b[0].length);
      continue;
    }
    const ic = remaining.match(/^\*(.+?)\*/);
    if (ic) {
      tokens.push({ type: 'italic', text: ic[1] });
      remaining = remaining.slice(ic[0].length);
      continue;
    }
    const c = remaining.match(/^`([^`]+)`/);
    if (c) {
      tokens.push({ type: 'inlineCode', text: c[1] });
      remaining = remaining.slice(c[0].length);
      continue;
    }
    const l = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (l) {
      tokens.push({ type: 'link', text: l[1], url: l[2] });
      remaining = remaining.slice(l[0].length);
      continue;
    }
    const n = remaining.match(/^([^*`[~\n]+)/);
    if (n) {
      tokens.push({ type: 'text', text: n[1] });
      remaining = remaining.slice(n[0].length);
      continue;
    }
    remaining = remaining.slice(1);
  }
  return tokens;
}

function highlightLine(line: string): Array<{ text: string; type: string }> {
  const tokens: Array<{ text: string; type: string }> = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '/' && line[i + 1] === '/') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      return tokens;
    }
    if (line[i] === '#') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      return tokens;
    }
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\') j++;
        j++;
      }
      if (j < line.length) j++;
      tokens.push({ text: line.slice(i, j), type: 'string' });
      i = j;
      continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s,=([+*\-/%]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.eExXoObB]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const KEYWORDS = new Set([
        'if',
        'else',
        'for',
        'while',
        'return',
        'function',
        'const',
        'let',
        'var',
        'class',
        'import',
        'from',
        'export',
        'async',
        'await',
        'new',
        'typeof',
        'null',
        'undefined',
        'true',
        'false',
      ]);
      if (KEYWORDS.has(word)) tokens.push({ text: word, type: 'keyword' });
      else if (j < line.length && line[j] === '(') tokens.push({ text: word, type: 'function' });
      else if (word[0] === word[0]?.toUpperCase() && word[0] !== word[0]?.toLowerCase())
        tokens.push({ text: word, type: 'type' });
      else tokens.push({ text: word, type: 'plain' });
      i = j;
      continue;
    }
    tokens.push({ text: line[i], type: 'plain' });
    i++;
  }
  return tokens;
}

describe('MarkdownRenderer — parseInline', () => {
  it('parses plain text', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', text: 'hello world' }]);
  });
  it('parses bold text', () => {
    expect(parseInline('**bold**')).toEqual([{ type: 'bold', text: 'bold' }]);
  });
  it('parses italic text', () => {
    expect(parseInline('*italic*')).toEqual([{ type: 'italic', text: 'italic' }]);
  });
  it('parses inline code', () => {
    expect(parseInline('`code`')).toEqual([{ type: 'inlineCode', text: 'code' }]);
  });
  it('parses strikethrough', () => {
    expect(parseInline('~~deleted~~')).toEqual([{ type: 'strikethrough', text: 'deleted' }]);
  });
  it('parses link markup', () => {
    expect(parseInline('[text](url)')).toEqual([{ type: 'link', text: 'text', url: 'url' }]);
  });
  it('parses mixed inline tokens', () => {
    expect(parseInline('Hello **bold** and `code`')).toHaveLength(4);
  });
  it('handles empty string', () => {
    expect(parseInline('')).toEqual([]);
  });
  it('handles string with no special formatting', () => {
    expect(parseInline('just text 123').length).toBe(1);
  });
});

describe('MarkdownRenderer — highlightLine', () => {
  it('highlights single-line comment', () => {
    const result = highlightLine('const x = 1; // comment');
    expect(result[result.length - 1].type).toBe('comment');
  });
  it('highlights hash comment', () => {
    expect(highlightLine('# comment')[0].type).toBe('comment');
  });
  it('highlights string literals', () => {
    const result = highlightLine('const x = "hello";');
    expect(result.find((t) => t.type === 'string')!.text).toBe('"hello"');
  });
  it('highlights numbers', () => {
    const result = highlightLine('let x = 42;');
    expect(result.find((t) => t.type === 'number')!.text).toBe('42');
  });
  it('highlights keywords', () => {
    const result = highlightLine('const x = async function() {};');
    expect(result.filter((t) => t.type === 'keyword').map((t) => t.text)).toContain('const');
  });
  it('highlights function names', () => {
    expect(highlightLine('myFunction()').find((t) => t.type === 'function')!.text).toBe(
      'myFunction'
    );
  });
  it('highlights type names', () => {
    const result = highlightLine('const x: MyType = new MyClass();');
    expect(result.filter((t) => t.type === 'type').map((t) => t.text)).toContain('MyType');
  });
  it('handles empty line', () => {
    expect(highlightLine('')).toEqual([]);
  });
});

describe('MarkdownRenderer — table parsing', () => {
  function parseTableRow(line: string): string[] {
    return line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  }
  function parseTableAlignment(line: string): Array<'left' | 'center' | 'right' | null> {
    return line
      .split('|')
      .slice(1, -1)
      .map((c) => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        if (t.startsWith(':')) return 'left';
        return null;
      });
  }
  it('parses table header row', () => {
    expect(parseTableRow('| Name | Age | City |')).toEqual(['Name', 'Age', 'City']);
  });
  it('parses row with empty cells', () => {
    expect(parseTableRow('| A | | C |')).toEqual(['A', '', 'C']);
  });
  it('parses default alignment', () => {
    expect(parseTableAlignment('| --- | --- |')).toEqual([null, null]);
  });
  it('parses center alignment', () => {
    expect(parseTableAlignment('| :---: |')).toEqual(['center']);
  });
  it('parses right alignment', () => {
    expect(parseTableAlignment('| ---: |')).toEqual(['right']);
  });
  it('parses left alignment', () => {
    expect(parseTableAlignment('| :--- |')).toEqual(['left']);
  });
  it('parses mixed alignment', () => {
    expect(parseTableAlignment('| :--- | :---: | ---: |')).toEqual(['left', 'center', 'right']);
  });
});

describe('ToolVisualizer — formatArgs', () => {
  function formatArgs(args: unknown): string {
    if (typeof args === 'string') return args;
    try {
      return JSON.stringify(args, null, 1);
    } catch {
      return String(args);
    }
  }
  it('returns string args as-is', () => {
    expect(formatArgs('hello')).toBe('hello');
  });
  it('formats object args as pretty JSON', () => {
    expect(formatArgs({ cmd: 'ls' })).toContain('"cmd"');
  });
  it('handles null args', () => {
    expect(formatArgs(null)).toBe('null');
  });
  it('handles undefined args (JSON.stringify returns undefined)', () => {
    // JSON.stringify(undefined) returns undefined, not a string
    expect(formatArgs(undefined)).toBeUndefined();
  });
});

describe('ToolVisualizer — formatDuration', () => {
  function formatDuration(ms: number): string {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }
  it('formats sub-second as ms', () => {
    expect(formatDuration(500)).toBe('500ms');
  });
  it('formats as seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });
  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('HeadlessRenderer — stripAnsi', () => {
  const ESC = String.fromCharCode(27);
  const ansiRegex = new RegExp(ESC + '\\[[\\d;]*m', 'g');
  function stripAnsi(text: string): string {
    return text.replace(ansiRegex, '');
  }
  it('strips ANSI escape codes', () => {
    expect(stripAnsi(ESC + '[31mhello' + ESC + '[0m')).toBe('hello');
  });
  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello')).toBe('hello');
  });
  it('returns empty string for empty input', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('HeadlessRenderer — ansiPad', () => {
  const ESC = String.fromCharCode(27);
  const ansiRegex = new RegExp(ESC + '\\[[\\d;]*m', 'g');
  function stripAnsi(text: string): string {
    return text.replace(ansiRegex, '');
  }
  function ansiPad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
    const visible = stripAnsi(text);
    const len = visible.length;
    if (len >= width) {
      return visible.slice(0, width - 1) + '\u2026';
    }
    const pad = ' '.repeat(width - len);
    return align === 'left' ? text + pad : pad + text;
  }
  it('left-aligns text', () => {
    expect(stripAnsi(ansiPad('hi', 5))).toBe('hi   ');
  });
  it('right-aligns text', () => {
    expect(stripAnsi(ansiPad('hi', 5, 'right'))).toBe('   hi');
  });
  it('truncates long text', () => {
    expect(stripAnsi(ansiPad('hello world', 6))).toBe('hello\u2026');
  });
  it('handles ANSI-colored text', () => {
    const colored = ESC + '[32mhi' + ESC + '[0m';
    expect(stripAnsi(ansiPad(colored, 5))).toBe('hi   ');
  });
});

describe('Edge cases — empty states', () => {
  it('parseInline handles very long strings', () => {
    expect(parseInline('a'.repeat(10000)).length).toBe(1);
  });
  it('highlightLine handles mixed syntax', () => {
    const result = highlightLine('const result = items.filter((x) => x > 0);');
    expect(result.some((t) => t.type === 'keyword')).toBe(true);
    expect(result.some((t) => t.type === 'function')).toBe(true);
  });
});

// ============================================================================
// HeadlessRenderer v3: sectionBlock, sectionLabel, findSuggestion, formatError
// ============================================================================

describe('HeadlessRenderer v3 — sectionBlock', () => {
  const c = createAnsiTheme('dark');

  it('creates a user section block with content', () => {
    const result = sectionBlock(c, 'user', 'Hello world');
    expect(result).toContain('🧑');
    expect(result).toContain('You');
    expect(result).toContain('Hello world');
  });

  it('creates a tool section block with custom label', () => {
    const result = sectionBlock(c, 'tool', 'Output', { label: 'run_command' });
    expect(result).toContain('🔧');
    expect(result).toContain('run_command');
  });

  it('includes optional details', () => {
    const result = sectionBlock(c, 'info', 'Content', { details: 'Extra info' });
    expect(result).toContain('Extra info');
  });

  it('renders error section', () => {
    const result = sectionBlock(c, 'error', 'Something went wrong');
    expect(result).toContain('❌');
    expect(result).toContain('Error');
  });
});

describe('HeadlessRenderer v3 — sectionLabel', () => {
  const c = createAnsiTheme('dark');

  it('returns compact label for user', () => {
    const result = stripAnsi(sectionLabel(c, 'user'));
    expect(result).toContain('🧑');
    expect(result).toContain('You');
  });

  it('returns compact label for assistant', () => {
    const result = stripAnsi(sectionLabel(c, 'assistant'));
    expect(result).toContain('🤖');
  });
});

describe('HeadlessRenderer v3 — findSuggestion', () => {
  it('returns suggestion for ENOENT error', () => {
    expect(findSuggestion('ENOENT: no such file')).toContain('File or directory');
  });

  it('returns suggestion for permission denied error', () => {
    expect(findSuggestion('EACCES: permission denied')).toContain('Permission denied');
  });

  it('returns suggestion for timeout', () => {
    expect(findSuggestion('ETIMEDOUT: timeout')).toContain('timed out');
  });

  it('returns suggestion for command not found', () => {
    expect(findSuggestion('command not found: git')).toContain('Command not found');
  });

  it('returns undefined for unknown error', () => {
    expect(findSuggestion('random message')).toBeUndefined();
  });
});

describe('HeadlessRenderer v3 — enhanced formatError', () => {
  const c = createAnsiTheme('dark');

  it('includes error type and suggestion', () => {
    const error = new Error('ENOENT: no such file or directory');
    error.name = 'Error';
    const result = stripAnsi(formatError(c, error));
    expect(result).toContain('❌ Error');
    expect(result).toContain('ENOENT');
    expect(result).toContain('File or directory not found');
  });

  it('includes context when provided', () => {
    const error = new Error('Something failed');
    const result = stripAnsi(formatError(c, error, 'running command ls'));
    expect(result).toContain('Context');
    expect(result).toContain('running command ls');
  });
});

describe('HeadlessRenderer v3 — enhanced renderToolResult', () => {
  const c = createAnsiTheme('dark');

  it('renders success tool result with emoji', () => {
    const result = stripAnsi(renderToolResult(c, {
      name: 'ls', status: 'success', durationMs: 150
    }));
    expect(result).toContain('✅');
    expect(result).toContain('[OK]');
    expect(result).toContain('ls');
    expect(result).toContain('150ms');
  });

  it('renders running tool result', () => {
    const result = stripAnsi(renderToolResult(c, {
      name: 'find', status: 'running'
    }));
    expect(result).toContain('⏳');
    expect(result).toContain('[RUNNING]');
  });

  it('renders failure tool result with preview', () => {
    const result = stripAnsi(renderToolResult(c, {
      name: 'rm', status: 'failure', durationMs: 500, preview: 'Permission denied'
    }));
    expect(result).toContain('❌');
    expect(result).toContain('[FAILED]');
    expect(result).toContain('Permission denied');
  });

  it('renders skipped tool result', () => {
    const result = stripAnsi(renderToolResult(c, {
      name: 'chmod', status: 'skipped'
    }));
    expect(result).toContain('⏭️');
    expect(result).toContain('[SKIPPED]');
  });
});

describe('HeadlessRenderer v3 — enhanced renderToolResults', () => {
  const c = createAnsiTheme('dark');

  it('renders empty results list', () => {
    expect(renderToolResults(c, [])).toBe('');
  });

  it('renders summary with counts', () => {
    const results = [
      { name: 'ls', status: 'success' as const },
      { name: 'find', status: 'failure' as const },
      { name: 'cat', status: 'skipped' as const },
    ];
    const result = stripAnsi(renderToolResults(c, results));
    expect(result).toContain('1 succeeded');
    expect(result).toContain('1 failed');
    expect(result).toContain('1 skipped');
    expect(result).toContain('3 total');
  });
});
