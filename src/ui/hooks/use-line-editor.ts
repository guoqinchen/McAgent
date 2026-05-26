/**
 * useLineEditor — readline-style line editing for Ink TUI.
 *
 * Provides cursor-aware input with standard Emacs/readline keybindings.
 * The hook owns its own text buffer + cursor state via useState.
 */

import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineEditorState {
  /** Current text value */
  value: string;
  /** Cursor position (0 = start, value.length = end) */
  cursor: number;
  /** Most recently killed text (for yank) */
  killRing: string;
}

export interface LineEditorActions {
  /** Handle an input event from Ink's useInput */
  handleInput: (input: string, key: InkKey) => void;
  /** Set the entire value (e.g. for history navigation) */
  setValue: (value: string) => void;
  /** Clear the editor state */
  clear: () => void;
}

/** Subset of Ink's Key object that we depend on */
export interface InkKey {
  return?: boolean;
  backspace?: boolean;
  delete?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  escape?: boolean;
  tab?: boolean;
}

// ─── Pure helpers (exported for testing) ──────────────────────────────────────

/** Return the start of the previous word from `cursor` going backward. */
export function prevWordBoundary(text: string, cursor: number): number {
  let i = cursor - 1;
  // skip trailing whitespace
  while (i >= 0 && text[i] === ' ') i--;
  // skip word chars
  while (i >= 0 && text[i] !== ' ') i--;
  return i + 1;
}

/** Return the start of the next word from `cursor` going forward. */
export function nextWordBoundary(text: string, cursor: number): number {
  let i = cursor;
  // skip current word chars
  while (i < text.length && text[i] !== ' ') i++;
  // skip whitespace
  while (i < text.length && text[i] === ' ') i++;
  return i;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLineEditor(initialValue = ''): LineEditorState & LineEditorActions {
  const [value, setValueRaw] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);
  const [killRing, setKillRing] = useState('');

  const setValue = useCallback((v: string) => {
    setValueRaw(v);
    setCursor(v.length);
  }, []);

  const clear = useCallback(() => {
    setValueRaw('');
    setCursor(0);
    setKillRing('');
  }, []);

  const handleInput = useCallback(
    (input: string, key: InkKey) => {
      // ── Navigation ────────────────────────────────────────────
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }

      // Ctrl+A: beginning of line
      if (key.ctrl && input === 'a') {
        setCursor(0);
        return;
      }
      // Ctrl+E: end of line
      if (key.ctrl && input === 'e') {
        setCursor(value.length);
        return;
      }

      // Alt+B: backward one word
      if (key.meta && input === 'b') {
        setCursor((c) => prevWordBoundary(value, c));
        return;
      }
      // Alt+F: forward one word
      if (key.meta && input === 'f') {
        setCursor((c) => nextWordBoundary(value, c));
        return;
      }

      // ── Deletion ──────────────────────────────────────────────
      if (key.backspace || (key.ctrl && input === 'h')) {
        if (cursor > 0) {
          setValueRaw((v) => v.slice(0, cursor - 1) + v.slice(cursor));
          setCursor((c) => c - 1);
        }
        return;
      }
      if (key.delete || (key.ctrl && input === 'd')) {
        if (cursor < value.length) {
          setValueRaw((v) => v.slice(0, cursor) + v.slice(cursor + 1));
        }
        return;
      }

      // ── Kill / Yank ───────────────────────────────────────────
      // Ctrl+K: kill from cursor to end
      if (key.ctrl && input === 'k') {
        const killed = value.slice(cursor);
        if (killed.length > 0) {
          setKillRing(killed);
          setValueRaw((v) => v.slice(0, cursor));
        }
        return;
      }
      // Ctrl+U: kill from start to cursor
      if (key.ctrl && input === 'u') {
        const killed = value.slice(0, cursor);
        if (killed.length > 0) {
          setKillRing(killed);
          setValueRaw((v) => v.slice(cursor));
          setCursor(0);
        }
        return;
      }
      // Ctrl+W: kill word backward
      if (key.ctrl && input === 'w') {
        const boundary = prevWordBoundary(value, cursor);
        const killed = value.slice(boundary, cursor);
        if (killed.length > 0) {
          setKillRing(killed);
          setValueRaw((v) => v.slice(0, boundary) + v.slice(cursor));
          setCursor(boundary);
        }
        return;
      }
      // Alt+D: kill word forward
      if (key.meta && input === 'd') {
        const boundary = nextWordBoundary(value, cursor);
        const killed = value.slice(cursor, boundary);
        if (killed.length > 0) {
          setKillRing(killed);
          setValueRaw((v) => v.slice(0, cursor) + v.slice(boundary));
        }
        return;
      }
      // Ctrl+Y: yank
      if (key.ctrl && input === 'y') {
        if (killRing.length > 0) {
          setValueRaw((v) => v.slice(0, cursor) + killRing + v.slice(cursor));
          setCursor((c) => c + killRing.length);
        }
        return;
      }

      // ── Printable characters ──────────────────────────────────
      if (input && !key.ctrl && !key.meta && !key.return && !key.escape && !key.tab) {
        setValueRaw((v) => v.slice(0, cursor) + input + v.slice(cursor));
        setCursor((c) => c + input.length);
      }
    },
    [value, cursor, killRing]
  );

  return { value, cursor, killRing, handleInput, setValue, clear };
}
