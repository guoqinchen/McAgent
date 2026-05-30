/**
 * MarkdownRenderer — enhanced terminal-friendly Markdown rendering for Ink TUI.
 */

import { useMemo, memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/use-theme.js';

export interface MarkdownRendererProps {
  content: string;
}

interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'inlineCode' | 'link';
  text: string;
  url?: string;
}

type Block =
  | { type: 'heading'; level: number; content: string }
  | { type: 'codeBlock'; lines: string[]; language?: string }
  | { type: 'listItem'; ordered: boolean; index?: number; content: string; indent: number }
  | { type: 'paragraph'; content: string }
  | { type: 'blockquote'; content: string }
  | { type: 'table'; header: string[]; rows: string[][]; alignments: Array<'left' | 'center' | 'right' | null> }
  | { type: 'hr' }
  | { type: 'blank' };

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'function', 'const', 'let', 'var', 'class', 'interface', 'type',
  'extends', 'implements', 'import', 'from', 'export', 'default', 'async',
  'await', 'yield', 'throw', 'try', 'catch', 'finally', 'new', 'this',
  'super', 'typeof', 'instanceof', 'void', 'null', 'undefined', 'true',
  'false', 'in', 'of', 'as', 'is', 'enum', 'namespace', 'module',
  'public', 'private', 'protected', 'static', 'readonly', 'abstract',
  'def', 'elif', 'print', 'lambda', 'pass', 'raise', 'with',
  'fn', 'let', 'mut', 'pub', 'impl', 'struct', 'enum', 'trait',
  'package', 'require', 'include', 'define',
]);

function detectLanguage(firstLine: string): string | undefined {
  const rest = firstLine.startsWith('```') ? firstLine.slice(3).trim() : '';
  return rest ? rest.toLowerCase() : undefined;
}

function highlightLine(line: string): Array<{ text: string; type: string }> {
  const tokens: Array<{ text: string; type: string }> = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '/' && line[i+1] === '/') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      return tokens;
    }
    if (line[i] === '#') {
      tokens.push({ text: line.slice(i), type: 'comment' });
      return tokens;
    }
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const q = line[i]; let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
      if (j < line.length) j++;
      tokens.push({ text: line.slice(i, j), type: 'string' }); i = j; continue;
    }
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s,=([+\-*/%]/.test(line[i-1]))) {
      let j = i;
      while (j < line.length && /[0-9.eExXoObB]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: 'number' }); i = j; continue;
    }
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (j < line.length && line[j] === '(') {
        tokens.push({ text: word, type: 'function' });
      } else if (word[0] === word[0]?.toUpperCase() && word[0] !== word[0]?.toLowerCase()) {
        tokens.push({ text: word, type: 'type' });
      } else {
        tokens.push({ text: word, type: 'plain' });
      }
      i = j; continue;
    }
    tokens.push({ text: line[i], type: 'plain' }); i++;
  }
  return tokens;
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const s = remaining.match(/^~~(.+?)~~/);
    if (s) { tokens.push({ type: 'strikethrough', text: s[1] }); remaining = remaining.slice(s[0].length); continue; }
    const b = remaining.match(/^\*\*(.+?)\*\*/);
    if (b) { tokens.push({ type: 'bold', text: b[1] }); remaining = remaining.slice(b[0].length); continue; }
    const ic = remaining.match(/^\*(.+?)\*/);
    if (ic) { tokens.push({ type: 'italic', text: ic[1] }); remaining = remaining.slice(ic[0].length); continue; }
    const c = remaining.match(/^`([^`]+)`/);
    if (c) { tokens.push({ type: 'inlineCode', text: c[1] }); remaining = remaining.slice(c[0].length); continue; }
    const l = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (l) { tokens.push({ type: 'link', text: l[1], url: l[2] }); remaining = remaining.slice(l[0].length); continue; }
    const n = remaining.match(/^([^*`[~\n]+)/);
    if (n) { tokens.push({ type: 'text', text: n[1] }); remaining = remaining.slice(n[0].length); continue; }
    remaining = remaining.slice(1);
  }
  return tokens;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      const lang = detectLanguage(line);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!); i++;
      }
      i++;
      blocks.push({ type: 'codeBlock', lines: codeLines, language: lang });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' }); i++; continue;
    }

    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: hm[1]!.length, content: hm[2]! });
      i++; continue;
    }

    const bqm = line.match(/^>\s*(.*)/);
    if (bqm) {
      const bqLines: string[] = [bqm[1]!]; i++;
      while (i < lines.length) {
        const nb = lines[i]!.match(/^>\s*(.*)/);
        if (nb) { bqLines.push(nb[1]!); i++; } else break;
      }
      blocks.push({ type: 'blockquote', content: bqLines.join('\n') });
      continue;
    }

    const tlm = line.match(/^\|(.+)\|$/);
    if (tlm && i + 1 < lines.length) {
      const headerRow = parseTableRow(line);
      const alignRow = lines[i+1]!;
      if (/^\|[\s:-]+\|$/.test(alignRow.trim())) {
        const alignments = parseTableAlignment(alignRow);
        const rows: string[][] = []; i += 2;
        while (i < lines.length) {
          const rm = lines[i]!.match(/^\|(.+)\|$/);
          if (rm) { rows.push(parseTableRow(lines[i]!)); i++; } else break;
        }
        blocks.push({ type: 'table', header: headerRow, rows, alignments });
        continue;
      }
    }

    const ulm = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulm) {
      blocks.push({ type: 'listItem', ordered: false, content: ulm[2]!, indent: ulm[1]!.length });
      i++; continue;
    }

    const olm = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (olm) {
      blocks.push({ type: 'listItem', ordered: true, index: parseInt(olm[2]!, 10), content: olm[3]!, indent: olm[1]!.length });
      i++; continue;
    }

    if (line.trim() === '') { blocks.push({ type: 'blank' }); i++; continue; }

    const pl: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== ''
      && !lines[i]!.startsWith('```')
      && !lines[i]!.match(/^(#{1,6})\s/)
      && !lines[i]!.match(/^(\s*)[-*+]\s/)
      && !lines[i]!.match(/^(\s*)(\d+)\.\s/)
      && !lines[i]!.match(/^>\s/)
      && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim())
      && !lines[i]!.match(/^\|(.+)\|$/)) {
      pl.push(lines[i]!); i++;
    }
    blocks.push({ type: 'paragraph', content: pl.join(' ') });
  }
  return blocks;
}

function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(c => c.trim());
}

function parseTableAlignment(line: string): Array<'left' | 'center' | 'right' | null> {
  return line.split('|').slice(1, -1).map(c => {
    const t = c.trim();
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    if (t.endsWith(':')) return 'right';
    if (t.startsWith(':')) return 'left';
    return null;
  });
}

// ─── Inline renderer ──────────────────────────────────────────────────────────

const InlineText = memo(function InlineText({ text }: { text: string }) {
  const theme = useTheme();
  const tokens = useMemo(() => parseInline(text), [text]);
  if (tokens.length === 0) return <Text>{text}</Text>;
  return (
    <Text>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'bold':
            return <Text key={i} bold>{token.text}</Text>;
          case 'italic':
            return <Text key={i} italic>{token.text}</Text>;
          case 'strikethrough':
            return <Text key={i} strikethrough dimColor>{token.text}</Text>;
          case 'inlineCode':
            return <Text key={i} color={theme.inlineCode}>{token.text}</Text>;
          case 'link':
            return <Text key={i} color={theme.link} underline>{token.text} ({token.url})</Text>;
          case 'text':
          default:
            return <Text key={i}>{token.text}</Text>;
        }
      })}
    </Text>
  );
});

// ─── Code block with syntax highlighting ──────────────────────────────────────

const CodeBlock = memo(function CodeBlock({ lines, language }: { lines: string[]; language?: string }) {
  const theme = useTheme();
  const colorMap: Record<string, string> = {
    keyword: theme.keyword,
    string: theme.string,
    comment: theme.comment,
    number: theme.number,
    function: theme.function,
    type: theme.type,
    plain: theme.codeBlock,
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      {language && <Text color={theme.codeLang} dimColor>\u2500\u2500 {language} \u2500\u2500</Text>}
      <Box flexDirection="column" paddingLeft={1}>
        {lines.map((codeLine, ci) => (
          <Text key={ci} wrap="wrap">
            {highlightLine(codeLine).map((t, ti) => (
              <Text key={ti} color={colorMap[t.type] || theme.codeBlock}>{t.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    </Box>
  );
});

// ─── Block renderer ───────────────────────────────────────────────────────────

const BlockElement = memo(function BlockElement({ block, index }: { block: Block; index: number }) {
  const theme = useTheme();

  switch (block.type) {
    case 'heading': {
      const d = block.level === 1 ? '\u2501' : block.level === 2 ? '\u2501\u2501' : '\u2014';
      return (
        <Box key={`b-${index}`} marginBottom={block.level <= 2 ? 1 : 0}>
          <Text bold color={theme.heading}>
            <Text color={theme.headingDecorator}>{d} </Text>
            <InlineText text={block.content} />
          </Text>
        </Box>
      );
    }
    case 'codeBlock':
      return <CodeBlock key={`b-${index}`} lines={block.lines} language={block.language} />;
    case 'listItem': {
      const indent = block.indent > 0 ? '  '.repeat(block.indent / 2) : '';
      return (
        <Box key={`b-${index}`} paddingLeft={block.indent}>
          <Text color={theme.listMarker}>{block.ordered ? `${block.index}. ` : `${indent}\u2022 `}</Text>
          <InlineText text={block.content} />
        </Box>
      );
    }
    case 'blockquote':
      return (
        <Box key={`b-${index}`} borderLeft borderColor={theme.blockquote} paddingLeft={1} marginBottom={1}>
          <Text wrap="wrap" color={theme.blockquote}><InlineText text={block.content} /></Text>
        </Box>
      );
    case 'table': {
      const cc = block.header.length;
      const cw: number[] = Array(cc).fill(0);
      for (let c = 0; c < cc; c++) cw[c] = Math.max(cw[c], block.header[c]?.length ?? 0);
      for (const row of block.rows)
        for (let c = 0; c < cc; c++) cw[c] = Math.max(cw[c], row[c]?.length ?? 0);
      const rc = (cell: string, w: number, a: 'left' | 'center' | 'right' | null) => {
        if (a === 'right') return cell.padStart(w, ' ');
        if (a === 'center') { const lp = Math.floor((w - cell.length) / 2); return ' '.repeat(lp) + cell + ' '.repeat(w - cell.length - lp); }
        return cell.padEnd(w, ' ');
      };
      return (
        <Box key={`b-${index}`} flexDirection="column" marginBottom={1}>
          <Box><Text color={theme.tableHeader}>\u2502 {block.header.map((cell, c) => <Text key={c}>{rc(cell, cw[c], block.alignments[c] ?? null)} \u2502 </Text>)}</Text></Box>
          <Box><Text color={theme.tableBorder}>\u251C{cw.map((w) => <Text key={w}>\u2500{'─'.repeat(w)}\u252C\u2500</Text>)}</Text></Box>
          {block.rows.map((row, ri) => (
            <Box key={ri}><Text color={theme.assistantText}>\u2502 {row.map((cell, c) => <Text key={c}>{rc(cell, cw[c], block.alignments[c] ?? null)} \u2502 </Text>)}</Text></Box>
          ))}
        </Box>
      );
    }
    case 'hr':
      return <Box key={`b-${index}`} marginTop={1} marginBottom={1}><Text color={theme.hr} dimColor>{'\u2500'.repeat(40)}</Text></Box>;
    case 'paragraph':
      return <Box key={`b-${index}`} marginBottom={1}><Text wrap="wrap"><InlineText text={block.content} /></Text></Box>;
    case 'blank':
      return <Box key={`b-${index}`} height={1} />;
    default:
      return null;
  }
});

// ─── Main component ───────────────────────────────────────────────────────────

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (<BlockElement key={i} block={block} index={i} />))}
    </Box>
  );
});
