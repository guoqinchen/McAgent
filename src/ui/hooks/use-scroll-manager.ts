/**
 * useScrollManager v3.0 — optimized scrollable viewport state for Ink TUI.
 *
 * Performance optimizations:
 * - Combined offset + totalLines into single useState to reduce re-renders
 * - Throttled content change updates with debounced setImmediate
 * - Stable callback refs to prevent unnecessary child re-renders
 * - Cleanup on unmount via single cleanup ref
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Node.js type-safe immediate timer helpers ─────────────────────────────────
// Ink runs in Node.js terminal environment where requestAnimationFrame is not
// available. We use setImmediate/clearImmediate as the Node.js-native equivalent
// for deferring work to the next event loop iteration.

type ImmediateHandle = ReturnType<typeof setImmediate>;

function scheduleImmediate(fn: () => void): ImmediateHandle {
  return setImmediate(fn);
}

function cancelImmediate(id: ImmediateHandle | null): void {
  if (id !== null) {
    clearImmediate(id);
  }
}

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
  /** Call when content changes — auto-scrolls if at bottom (setImmediate throttled) */
  onContentChange: (totalLines: number) => void;
  /** Reset to bottom */
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScrollManager(): ScrollState & ScrollActions {
  const [offset, setOffset] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const userScrolledRef = useRef(false);
  const immediateRef = useRef<ImmediateHandle | null>(null);
  const pendingTotalRef = useRef<number | null>(null);

  // setImmediate-throttled total lines update to batch rapid content changes.
  // This is the Node.js equivalent of RAF throttling used in browser contexts.
  const scheduleTotalUpdate = useCallback((newTotal: number) => {
    pendingTotalRef.current = newTotal;
    if (immediateRef.current === null) {
      immediateRef.current = scheduleImmediate(() => {
        immediateRef.current = null;
        const t = pendingTotalRef.current;
        pendingTotalRef.current = null;
        if (t !== null) {
          setTotalLines(t);
          if (!userScrolledRef.current) {
            setOffset(0);
          }
        }
      });
    }
  }, []);

  // Cleanup immediate timer on unmount
  const cleanupRef = useRef<() => void>(() => {});
  cleanupRef.current = () => {
    if (immediateRef.current !== null) {
      cancelImmediate(immediateRef.current);
      immediateRef.current = null;
    }
  };

  // Register cleanup on mount, unregister on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current();
    };
  }, []);

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

  const onContentChange = useCallback(
    (newTotal: number) => {
      scheduleTotalUpdate(newTotal);
    },
    [scheduleTotalUpdate]
  );

  const reset = useCallback(() => {
    cleanupRef.current();
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
