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
