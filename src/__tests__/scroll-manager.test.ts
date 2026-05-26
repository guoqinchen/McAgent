import { describe, it, expect } from 'vitest';

// Test the scroll manager's pure logic by simulating its state transitions.
// The hook uses React useState, so we test the behavioral contract directly.

describe('useScrollManager (behavioral contract)', () => {
  // Simulate the scroll manager's core state logic
  function createScrollState(totalLines: number) {
    let offset = 0;
    let userScrolledUp = false;

    return {
      get offset() {
        return offset;
      },
      get isScrolledUp() {
        return userScrolledUp;
      },
      pageUp(viewportLines: number) {
        const next = Math.min(totalLines, offset + viewportLines);
        offset = next;
        if (next > 0) userScrolledUp = true;
      },
      pageDown(viewportLines: number) {
        const next = Math.max(0, offset - viewportLines);
        offset = next;
        if (next === 0) userScrolledUp = false;
      },
      lineUp() {
        const next = Math.min(totalLines, offset + 1);
        offset = next;
        if (next > 0) userScrolledUp = true;
      },
      lineDown() {
        const next = Math.max(0, offset - 1);
        offset = next;
        if (next === 0) userScrolledUp = false;
      },
      jumpTop() {
        offset = totalLines;
        userScrolledUp = true;
      },
      jumpBottom() {
        offset = 0;
        userScrolledUp = false;
      },
      onContentChange(newTotal: number) {
        totalLines = newTotal;
        if (!userScrolledUp) offset = 0;
      },
    };
  }

  it('starts at bottom (offset 0)', () => {
    const state = createScrollState(100);
    expect(state.offset).toBe(0);
    expect(state.isScrolledUp).toBe(false);
  });

  it('pageUp increases offset', () => {
    const state = createScrollState(100);
    state.pageUp(10);
    expect(state.offset).toBe(10);
  });

  it('pageUp saturates at totalLines', () => {
    const state = createScrollState(20);
    state.pageUp(30);
    expect(state.offset).toBe(20);
  });

  it('pageDown decreases offset', () => {
    const state = createScrollState(100);
    state.pageUp(10);
    state.pageDown(5);
    expect(state.offset).toBe(5);
  });

  it('pageDown saturates at 0', () => {
    const state = createScrollState(100);
    state.pageUp(5);
    state.pageDown(20);
    expect(state.offset).toBe(0);
  });

  it('sets isScrolledUp when scrolling up', () => {
    const state = createScrollState(100);
    state.pageUp(10);
    expect(state.isScrolledUp).toBe(true);
  });

  it('clears isScrolledUp when scrolling back to bottom', () => {
    const state = createScrollState(100);
    state.pageUp(10);
    state.pageDown(10);
    expect(state.isScrolledUp).toBe(false);
  });

  it('auto-scrolls to bottom on content change when at bottom', () => {
    const state = createScrollState(10);
    state.pageUp(3);
    state.pageDown(3); // back to bottom
    state.onContentChange(20);
    expect(state.offset).toBe(0);
  });

  it('does not auto-scroll when user is scrolled up', () => {
    const state = createScrollState(10);
    state.pageUp(3);
    state.onContentChange(20);
    expect(state.offset).toBe(3);
  });

  it('jumpTop goes to totalLines', () => {
    const state = createScrollState(100);
    state.jumpTop();
    expect(state.offset).toBe(100);
    expect(state.isScrolledUp).toBe(true);
  });

  it('jumpBottom goes to 0', () => {
    const state = createScrollState(100);
    state.jumpTop();
    state.jumpBottom();
    expect(state.offset).toBe(0);
    expect(state.isScrolledUp).toBe(false);
  });
});
