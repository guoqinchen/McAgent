# 修复计划：JavaScript Heap Out of Memory 问题

## 问题分析

Node.js 进程因堆内存耗尽崩溃，堆大小约 4GB。错误发生在 Mark-Compact GC 阶段，表明存在内存泄漏或大量未释放的对象。

### 根因假设（按可能性排序）

| 优先级 | 假设 | 预测 | 验证方法 |
|--------|------|------|----------|
| 1 | **MetricsCollector.totalLatency/totalTokens 无限增长** | 如果会话运行很长时间，这些累加值可能达到 JavaScript 安全整数限制导致内存膨胀 | 检查 metrics 是否有上限机制 |
| 2 | **ConversationHistory 消息数组无主动清理** | `messages` 数组在驱逐前可能积累大量消息 | 检查 evictIfNeeded 调用频率 |
| 3 | **FileHandler.writeQueue 队列无限增长** | 如果日志写入速度慢于生产速度，队列会膨胀 | 检查队列大小限制 |

---

## 修复计划

### Step 1: 修复 MetricsCollector 无界累加器

**文件**: `src/monitoring/metrics-collector.ts`

**问题**: `totalLatency` 和 `totalTokens` 是 Number 类型，会无限增长。

**修改**:

```typescript
// 1. 添加滑动窗口或周期重置机制
private static readonly MAX_LATENCY_SAMPLES = 1000;
private latencySamples: number[] = [];  // 替代 totalLatency
private tokenSamples: { prompt: number; completion: number }[] = [];

// 2. 修改 recordToolCall 和 updateMetrics
private updateMetrics(timing: RequestTiming): void {
  // 使用滑动窗口替代无限累加
  this.latencySamples.push(latency);
  if (this.latencySamples.length > MetricsCollector.MAX_LATENCY_SAMPLES) {
    this.latencySamples.shift();
  }

  if (timing.tokens) {
    this.tokenSamples.push(timing.tokens);
    if (this.tokenSamples.length > MetricsCollector.MAX_LATENCY_SAMPLES) {
      this.tokenSamples.shift();
    }
  }

  // 计算统计值
  this.metrics.totalLatency = this.latencySamples.reduce((a, b) => a + b, 0);
  this.metrics.minLatency = Math.min(...this.latencySamples);
  this.metrics.maxLatency = Math.max(...this.latencySamples);
  this.metrics.totalTokens = this.tokenSamples.reduce((a, b) => a + b.prompt + b.completion, 0);
}

// 3. 添加定期重置方法
reset(): void {
  this.metrics = { /* ... */ };
  this.activeRequests.clear();
  this.latencySamples = [];
  this.tokenSamples = [];
}
```

**验证**: `grep -n "totalLatency" src/monitoring/metrics-collector.ts`

---

### Step 2: 优化 ConversationHistory 驱逐策略

**文件**: `src/agent/conversation.ts`

**问题**: 当前驱逐只在 LLM 调用前触发，可能不够频繁。

**修改**:

```typescript
// 1. 在 addToolResult 后也触发驱逐检查（工具结果通常很大）
addToolResult(toolCallId: string, content: string): void {
  const truncated = /* ... */;
  this.messages.push({ role: 'tool', tool_call_id: toolCallId, content: truncated });

  // 工具结果添加后检查是否需要驱逐
  if (this.messages.length > 100) {
    this.evictIfNeeded();
  }
}

// 2. 添加最大消息数限制
private static readonly MAX_MESSAGES = 200;
private static readonly MAX_CONTEXT_TOKENS_PER_CALL = 800_000;

evictIfNeeded(maxContextTokens: number = DEFAULT_MAX_CONTEXT_TOKENS): void {
  // 双重限制：消息数和 token 数
  const effectiveLimit = Math.min(
    maxContextTokens,
    DEFAULT_MAX_CONTEXT_TOKENS_PER_CALL
  );

  // 强制驱逐如果消息数过多
  if (this.messages.length > ConversationHistory.MAX_MESSAGES) {
    const targetSize = Math.floor(ConversationHistory.MAX_MESSAGES * 0.7);
    while (this.messages.length > targetSize) {
      this.messages.shift(); // 移除最老的消息
    }
    this.markCacheDirty();
    return;
  }

  // 原有的 token 驱逐逻辑
  // ...
}
```

---

### Step 3: 限制 FileHandler 写队列大小

**文件**: `src/logging/structured-logger.ts`

**问题**: `writeQueue` 数组可能无限增长。

**修改**:

```typescript
export class FileHandler implements LogHandler {
  private filePath: string;
  private writeQueue: string[] = [];
  private flushing = false;
  private static readonly MAX_QUEUE_SIZE = 1000;  // 添加上限

  handle(record: LogRecord): void {
    if (!this.shouldLog(record.level)) return;

    const logEntry = JSON.stringify({ /* ... */ });

    // 队列满时丢弃最老的日志
    if (this.writeQueue.length >= FileHandler.MAX_QUEUE_SIZE) {
      this.writeQueue.shift();
    }

    this.writeQueue.push(logEntry + '\n');
    this.scheduleFlush();
  }
}
```

---

### Step 4: 添加 Node.js 堆内存监控和警告

**新增文件**: `src/monitoring/memory-guard.ts`

**目的**: 在内存接近危险阈值时主动触发 GC 或警告。

```typescript
export class MemoryGuard {
  private static readonly HEAP_WARNING_MB = 3072;  // 3GB 警告
  private static readonly HEAP_CRITICAL_MB = 3584; // 3.5GB 危险

  static check(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;

    if (heapUsedMB > MemoryGuard.HEAP_CRITICAL_MB) {
      logger.warn('Critical memory usage', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024)
      });

      // 强制 GC 如果可用
      if (global.gc) {
        global.gc();
      }
    } else if (heapUsedMB > MemoryGuard.HEAP_WARNING_MB) {
      logger.warn('High memory usage', {
        heapUsedMB: Math.round(heapUsedMB)
      });
    }
  }
}
```

**集成**: 在 `agent.ts` 的 `runLoop` 开始时调用:

```typescript
private async runLoop(sync = false, signal?: AbortSignal): Promise<string> {
  MemoryGuard.check();  // 添加

  for (let round = 0; round < this.config.maxToolRounds; round++) {
    // ...
  }
}
```

---

### Step 5: 增加 Node.js 堆内存限制配置

**文件**: `package.json` 或启动脚本

```json
{
  "scripts": {
    "start": "node --max-old-space-size=4096 dist/cli.js",
    "start:headless": "node --max-old-space-size=4096 dist/headless.js"
  }
}
```

---

## 实施顺序

1. **Step 4** (MemoryGuard) - 最快产出，可以立即观察到内存使用
2. **Step 1** (MetricsCollector) - 消除一个主要的内存增长源
3. **Step 3** (FileHandler) - 限制日志队列
4. **Step 2** (ConversationHistory) - 增强驱逐策略
5. **Step 5** (启动配置) - 提供最后的安全网

---

## 验证方法

```bash
# 运行内存监控测试
npm run build && node --expose-gc dist/headless.js

# 观察内存使用
watch -n 1 'ps aux | grep node | grep -v grep'

# 检查堆大小
node -e "setInterval(() => console.log(process.memoryUsage()), 1000)"
```
