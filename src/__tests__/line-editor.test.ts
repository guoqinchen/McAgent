import { describe, it, expect } from 'vitest';
import { prevWordBoundary, nextWordBoundary } from '../ui/hooks/use-line-editor.js';

describe('prevWordBoundary', () => {
  it('moves to previous word start from middle of word', () => {
    expect(prevWordBoundary('hello world', 7)).toBe(6); // "hello w|orld" → "hello |world"
  });

  it('moves to previous word start across multiple spaces', () => {
    expect(prevWordBoundary('hello   world', 9)).toBe(8); // "hello   |world" → skip spaces → "hello|   world"
  });

  it('returns 0 when at start of first word', () => {
    expect(prevWordBoundary('hello', 2)).toBe(0);
  });

  it('returns 0 from position 0', () => {
    expect(prevWordBoundary('hello', 0)).toBe(0);
  });

  it('skips trailing whitespace before cursor', () => {
    expect(prevWordBoundary('abc   def', 5)).toBe(0); // cursor at space after "abc", goes to start
  });

  it('handles cursor at start of word after spaces', () => {
    expect(prevWordBoundary('a b c', 4)).toBe(2); // "a b| c" → "a |b c"
  });
});

describe('nextWordBoundary', () => {
  it('moves to next word start from within a word', () => {
    expect(nextWordBoundary('hello world', 1)).toBe(6); // "h|ello world" → "hello |world"
  });

  it('skips whitespace to find next word', () => {
    expect(nextWordBoundary('a   b', 0)).toBe(4); // "|a   b" → "a   |b"
  });

  it('returns length when no next word', () => {
    expect(nextWordBoundary('hello', 3)).toBe(5);
  });

  it('returns length when cursor at last word', () => {
    expect(nextWordBoundary('one two', 6)).toBe(7);
  });

  it('handles cursor at space between words', () => {
    expect(nextWordBoundary('a b c', 2)).toBe(4); // "a |b c" → "a b| c"
  });
});
