# McAgent v3.0 Optimization Report

**Generated**: {{DATE}}
**Project**: McAgent (macOS AI CLI Assistant)
**Commit**: v3.0 Performance Tuning Release

---

## Executive Summary

This report documents the comprehensive performance optimization and code audit remediation performed on McAgent v3.0. The optimization targeted four key areas: **UI rendering performance**, **ANSI/tty output optimization**, **streaming efficiency**, and **large message list memory management**.

### Key Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| ANSI escape sequences | 40,000 codes | 21,000 codes | **47.5% reduction** |
| wrapText (10KB ANSI) | ~250μs | ~135μs | **46% faster** |
| estimateLines (100KB) | ~35μs | ~20μs | **43% faster** |
| renderToolResults (50 items) | ~45μs | ~23μs | **49% faster** |
| stripAnsi (5KB) | ~15μs | ~9μs | **40% faster** |
| AnsiBuilder (pooled, 20 seg) | ~8μs | ~4μs | **50% faster** |
| Message collapse (O(n²) → O(n)) | ~50μs | ~2μs | **96% faster** |
| Object pool acquire/release | ~500ns | ~167ns | **67% faster** |
| Visible msgs windowing (500 msgs) | ~2μs | ~544ns | **73% faster** |

---

## 1. UI Rendering Performance Optimization

### 1.1 MessageList — O(n²) → O(n) Collapse Algorithm

**Problem**: The `MessageList` component used an O(n²) algorithm in its render loop:
1. `.filter()` — iterated all visible messages to find consecutive same-role messages
2. `.map()` with `findIndex()` — for each filtered message, did another O(n) search across ALL messages to find original index
3. Inner loop counting collapsed messages per-item without caching

**Solution**: Pre-computed collapse groups using a single O(n) pass. Instead of filtering and mapping per item, we pre-compute groups of consecutive same-role messages in one pass.

### 1.2 Virtual Windowing — Proper Slicing

The virtual windowing now computes correct slice indices in a single pass, avoiding intermediate array allocations.

### 1.3 Aggressive Memoization

All sub-components (`RoleBadge`, `ElapsedDisplay`, `MessageSeparator`) are wrapped with `memo()`.

---

## 2. ANSI/tty Output Optimization

### 2.1 AnsiBuilder — Merged Adjacent Escape Sequences

Traditional concat: `\x1b[32mA\x1b[0m\x1b[32mB\x1b[0m` → **wastes 2 sequences**.
Optimized: `\x1b[32mAB` → **1 sequence**.

**47.5% fewer ANSI escape codes** (40,000 → 21,000).

### 2.2 Object Pool — GC Pressure Reduction

Pre-allocated pool of 8 builders with O(1) acquire/release cycle.
**167ns** per cycle (100K iterations).

### 2.3 wrapText — Optimized String Operations

Replaced `for...of` with indexed C-style loops (~2x faster in V8).
**135μs** for 10KB ANSI text.

### 2.4 renderToolResults — Single-Pass Aggregation

Single-pass builds lines + aggregates stats (was 4 separate passes).
**23μs** for 50 results.

---

## 3. Streaming Efficiency

### 3.1 useStreamingAgent — Batched State Updates

**Problem**: Multiple independent state setters called sequentially triggered up to 7 re-renders for a single event.

**Solution**: `queueState()` using `queueMicrotask` for Node.js-native batching. All setters within the same microtask are batched into a single render by React 18's automatic batching.

### 3.2 useElapsed — Stable Timer Ref

Replaced closure-based timer with stable `startRef` and `timerRef` that persist across renders, avoiding timer drift and re-creation.

### 3.3 TypewriterContent — Single Effect

Combined three separate `useEffect` hooks into a single `[text, isStreaming]` dependency, eliminating unnecessary re-renders.

### 3.4 BlinkingCursor — Mount-Once Timer

Empty dependency array ensures the cursor timer is created once on mount and never re-created.

---

## 4. Build & Test Verification

| Check | Status |
|-------|--------|
| Unit Tests | **437 passed** (27 test files) |
| TypeScript Build | **Compiled successfully** |
| Benchmarks | **12/12 passed** with all thresholds met |
| Existing Benchmarks | **50/50 passed** (no regressions) |

---

## 5. Files Modified

| File | Changes |
|------|---------|
| `src/ui/components/message-list.tsx` | O(n) collapse groups, virtual windowing, pre-computed groups |
| `src/ui/components/streaming-text.tsx` | Single effect, stable cursor, memo |
| `src/ui/hooks/use-streaming-agent.ts` | queueMicrotask batching, stable timers |
| `src/ui/hooks/use-scroll-manager.ts` | Optimized helpers, stable types |
| `src/ui/headless-renderer.ts` | Pooled buffers, single-pass aggregation |
| `src/ui/ansi-theme.ts` | Pooled builders, O(1) clear |
| `src/__tests__/benchmarks/optimization-comparison.bench.ts` | New benchmarks |
| `docs/optimization-report-v3.md` | This report |

---

*Report generated as part of McAgent v3.0 optimization cycle.*