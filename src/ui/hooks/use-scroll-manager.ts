/**
 * useScrollManager — scrollable viewport state for Ink TUI.
 *
 * Manages scroll offset for paginating message history. Auto-scrolls to
 * bottom when streaming or when the user is already at the bottom.
 */

import { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrollState {
  /** Current scroll offset (0 = bottom / newest) */
  offset: number;
  /** Whether the user has manually scrolled away from the bottom */
  isScrolledUp: boolean;
}

export interface ScrollActions {
  /** Page up by viewport height */
  pageUp: (viewportLines: number) => void;
  /** Page down by viewport height */
  pageDown: (viewportLines: number) => void;
  /** Scroll up one line */
  lineUp: () => void;
  /** Scroll down one line */
  lineDown: () => void;
  /** Jump to top */
  jumpTop: () => void;
  /** Jump to bottom */
  jumpBottom: () => void;
  /** Call when content changes — auto-scrolls if at bottom */
  onContentChange: (totalLines: number) => void;
  /** Reset to bottom */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScrollManager(): ScrollState & ScrollActions {
  const [offset, setOffset] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const userScrolledRef = useRef(false);

  // When user manually scrolls up from bottom, mark as scrolled up
  const pageUp = useCallback(
    (viewportLines: number) => {
      setOffset((prev) => {
        const next = Math.min(totalLines, prev + viewportLines);
        if (next > 0) userScrolledRef.current = true;
        return next;
      });
    },
    [totalLines]
  );

  const pageDown = useCallback((viewportLines: number) => {
    setOffset((prev) => {
      const next = Math.max(0, prev - viewportLines);
      if (next === 0) userScrolledRef.current = false;
      return next;
    });
  }, []);

  const lineUp = useCallback(() => {
    setOffset((prev) => {
      const next = Math.min(totalLines, prev + 1);
      if (next > 0) userScrolledRef.current = true;
      return next;
    });
  }, [totalLines]);

  const lineDown = useCallback(() => {
    setOffset((prev) => {
      const next = Math.max(0, prev - 1);
      if (next === 0) userScrolledRef.current = false;
      return next;
    });
  }, []);

  const jumpTop = useCallback(() => {
    setOffset(totalLines);
    userScrolledRef.current = true;
  }, [totalLines]);

  const jumpBottom = useCallback(() => {
    setOffset(0);
    userScrolledRef.current = false;
  }, []);

  const onContentChange = useCallback((newTotal: number) => {
    setTotalLines(newTotal);
    // Auto-scroll to bottom unless user has scrolled up
    if (!userScrolledRef.current) {
      setOffset(0);
    }
  }, []);

  const reset = useCallback(() => {
    setOffset(0);
    setTotalLines(0);
    userScrolledRef.current = false;
  }, []);

  const isScrolledUp = offset > 0;

  return {
    offset,
    isScrolledUp,
    pageUp,
    pageDown,
    lineUp,
    lineDown,
    jumpTop,
    jumpBottom,
    onContentChange,
    reset,
  };
}
