/**
 * MarkdownRenderer — terminal-friendly Markdown rendering for Ink TUI.
 *
 * Lightweight line-by-line parser. Supports:
 * - Headings (h1-h3)
 * - Bold (**text**) and italic (*text*)
 * - Inline code (`code`) and fenced code blocks (```...```)
 * - Unordered lists (-, *) and ordered lists (1.)
 * - Links [text](url) — shown as "text (url)" in terminal
 */

import { useMemo, memo } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../hooks/use-theme.js';

export interface MarkdownRendererProps {
  content: string;
}

/** Inline token: a segment of styled text. */
interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'inlineCode' | 'link';
  text: string;
  url?: string;
}

/** Parsed block element. */
type Block =
  | { type: 'heading'; level: number; content: string }
  | { type: 'codeBlock'; lines: string[] }
  | { type: 'listItem'; ordered: boolean; index?: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'blank' };

// ─── Inline parser ────────────────────────────────────────────────────────────

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      tokens.push({ type: 'bold', text: boldMatch[1]! });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      tokens.push({ type: 'italic', text: italicMatch[1]! });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({ type: 'inlineCode', text: codeMatch[1]! });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tokens.push({ type: 'link', text: linkMatch[1]!, url: linkMatch[2]! });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const nextMatch = remaining.match(/^([^*`[\n]+)/);
    if (nextMatch) {
      tokens.push({ type: 'text', text: nextMatch[1]! });
      remaining = remaining.slice(nextMatch[0].length);
      continue;
    }

    remaining = remaining.slice(1);
  }

  return tokens;
}

// ─── Block parser ─────────────────────────────────────────────────────────────

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'codeBlock', lines: codeLines });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1]!.length,
        content: headingMatch[2]!,
      });
      i++;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (ulMatch) {
      blocks.push({ type: 'listItem', ordered: false, content: ulMatch[2]! });
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (olMatch) {
      blocks.push({
        type: 'listItem',
        ordered: true,
        index: parseInt(olMatch[2]!, 10),
        content: olMatch[3]!,
      });
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-blank, non-special lines)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('```') && !lines[i]!.match(/^(#{1,3})\s/) && !lines[i]!.match(/^(\s*)[-*]\s/) && !lines[i]!.match(/^(\s*)(\d+)\.\s/)) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ type: 'paragraph', content: paraLines.join(' ') });
  }

  return blocks;
}

// ─── Inline renderer ──────────────────────────────────────────────────────────

const InlineText = memo(function InlineText({ text }: { text: string }) {
  const theme = useTheme();
  const tokens = useMemo(() => parseInline(text), [text]);

  if (tokens.length === 0) {
    return <Text>{text}</Text>;
  }

  return (
    <Text>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'bold':
            return (
              <Text key={i} bold>
                {token.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} italic>
                {token.text}
              </Text>
            );
          case 'inlineCode':
            return (
              <Text key={i} color={theme.inlineCode}>
                {token.text}
              </Text>
            );
          case 'link':
            return (
              <Text key={i} color={theme.link} underline>
                {token.text}
                {' ('}
                {token.url}
                {')'}
              </Text>
            );
          case 'text':
          default:
            return <Text key={i}>{token.text}</Text>;
        }
      })}
    </Text>
  );
});

// ─── Block renderer ───────────────────────────────────────────────────────────

const BlockElement = memo(function BlockElement({ block, index }: { block: Block; index: number }) {
  const theme = useTheme();

  switch (block.type) {
    case 'heading':
      return (
        <Box key={`b-${index}`} marginBottom={block.level === 1 ? 1 : 0}>
          <Text bold color={theme.heading}>
            {block.level === 1 ? '━ '.repeat(3) : block.level === 2 ? '━━ ' : '━━━ '}
            <InlineText text={block.content} />
          </Text>
        </Box>
      );

    case 'codeBlock':
      return (
        <Box
          key={`b-${index}`}
          flexDirection="column"
          marginBottom={1}
          paddingLeft={1}
        >
          {block.lines.map((codeLine, ci) => (
            <Text key={ci} color={theme.codeBlock}>
              {codeLine}
            </Text>
          ))}
        </Box>
      );

    case 'listItem':
      return (
        <Box key={`b-${index}`}>
          <Text color={theme.listMarker}>
            {block.ordered ? `${block.index}. ` : '  • '}
          </Text>
          <InlineText text={block.content} />
        </Box>
      );

    case 'paragraph':
      return (
        <Box key={`b-${index}`} marginBottom={1}>
          <Text wrap="wrap">
            <InlineText text={block.content} />
          </Text>
        </Box>
      );

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
      {blocks.map((block, i) => (
        <BlockElement key={i} block={block} index={i} />
      ))}
    </Box>
  );
});
