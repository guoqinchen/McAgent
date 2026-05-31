export interface MetricData {
  requests: number;
  successes: number;
  failures: number;
  totalLatency: number;
  minLatency: number;
  maxLatency: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  errorTypes: Record<string, number>;
  render: {
    totalFrames: number;
    slowFrames: number;
    avgFrameTimeMs: number;
    maxFrameTimeMs: number;
    totalFrameTimeMs: number;
  };
}

export interface RequestTiming {
  startTime: number;
  endTime?: number;
  success?: boolean;
  errorType?: string;
  tokens?: {
    prompt: number;
    completion: number;
  };
}

class CircularBuffer {
  private buffer: number[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private runningSum = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    if (this.count === this.capacity) {
      const removed = this.buffer[this.head]!;
      this.runningSum -= removed;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.count++;
    }
    this.buffer[this.tail] = value;
    this.runningSum += value;
    this.tail = (this.tail + 1) % this.capacity;
  }

  get sum(): number {
    return this.runningSum;
  }

  get min(): number {
    if (this.count === 0) return Infinity;
    let min = Infinity;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const val = this.buffer[idx]!;
      if (val < min) min = val;
    }
    return min;
  }

  get max(): number {
    if (this.count === 0) return 0;
    let max = 0;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const val = this.buffer[idx]!;
      if (val > max) max = val;
    }
    return max;
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.runningSum = 0;
  }
}

class TokenCircularBuffer {
  private buffer: Array<{ prompt: number; completion: number }>;
  private head = 0;
  private tail = 0;
  private count = 0;
  private runningPrompt = 0;
  private runningCompletion = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(tokens: { prompt: number; completion: number }): void {
    if (this.count === this.capacity) {
      const removed = this.buffer[this.head]!;
      this.runningPrompt -= removed.prompt;
      this.runningCompletion -= removed.completion;
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.count++;
    }
    this.buffer[this.tail] = tokens;
    this.runningPrompt += tokens.prompt;
    this.runningCompletion += tokens.completion;
    this.tail = (this.tail + 1) % this.capacity;
  }

  get totalPrompt(): number {
    return this.runningPrompt;
  }

  get totalCompletion(): number {
    return this.runningCompletion;
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.runningPrompt = 0;
    this.runningCompletion = 0;
  }
}

export class MetricsCollector {
  private static readonly MAX_ACTIVE_REQUESTS = 100;
  private static readonly REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

  private metrics: MetricData = {
    requests: 0,
    successes: 0,
    failures: 0,
    totalLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    errorTypes: {},
    render: {
      totalFrames: 0,
      slowFrames: 0,
      avgFrameTimeMs: 0,
      maxFrameTimeMs: 0,
      totalFrameTimeMs: 0,
    },
  };

  private latencyBuffer: CircularBuffer;
  private tokenBuffer: TokenCircularBuffer;
  private activeRequests = new Map<string, RequestTiming>();

  constructor() {
    this.latencyBuffer = new CircularBuffer(1000);
    this.tokenBuffer = new TokenCircularBuffer(1000);
  }

  startRequest(requestId: string): void {
    if (this.activeRequests.size >= MetricsCollector.MAX_ACTIVE_REQUESTS) {
      const oldest = this.activeRequests.keys().next().value;
      if (oldest) this.activeRequests.delete(oldest);
    }
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
    });
  }

  endRequest(
    requestId: string,
    success: boolean,
    errorType?: string,
    tokens?: { prompt: number; completion: number }
  ): void {
    const timing = this.activeRequests.get(requestId);
    if (!timing) return;

    timing.endTime = Date.now();
    timing.success = success;
    timing.errorType = errorType;
    timing.tokens = tokens;

    this.updateMetrics(timing);
    this.activeRequests.delete(requestId);
  }

  private updateMetrics(timing: RequestTiming): void {
    const latency = timing.endTime! - timing.startTime;

    this.metrics.requests++;
    this.latencyBuffer.push(latency);
    this.metrics.totalLatency = this.latencyBuffer.sum;

    if (timing.success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
      if (timing.errorType) {
        this.metrics.errorTypes[timing.errorType] =
          (this.metrics.errorTypes[timing.errorType] || 0) + 1;
      }
    }

    if (timing.tokens) {
      this.tokenBuffer.push(timing.tokens);
      this.metrics.promptTokens = this.tokenBuffer.totalPrompt;
      this.metrics.completionTokens = this.tokenBuffer.totalCompletion;
      this.metrics.totalTokens = this.metrics.promptTokens + this.metrics.completionTokens;
    }
  }

  recordToolCall(duration: number, success: boolean, _toolName: string): void {
    this.metrics.requests++;
    this.latencyBuffer.push(duration);
    this.metrics.totalLatency = this.latencyBuffer.sum;

    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
      this.metrics.errorTypes['tool_call'] = (this.metrics.errorTypes['tool_call'] || 0) + 1;
    }
  }

  recordFrame(frameTimeMs: number): void {
    const r = this.metrics.render;
    r.totalFrames++;
    r.totalFrameTimeMs += frameTimeMs;
    r.maxFrameTimeMs = Math.max(r.maxFrameTimeMs, frameTimeMs);
    if (frameTimeMs > 32) {
      r.slowFrames++;
    }
    r.avgFrameTimeMs = r.totalFrameTimeMs / r.totalFrames;
  }

  getSlowFrameRate(): number {
    const r = this.metrics.render;
    return r.totalFrames > 0 ? r.slowFrames / r.totalFrames : 0;
  }

  getMetrics(): Readonly<MetricData> {
    return { ...this.metrics };
  }

  getSummary(): {
    requests: number;
    successRate: number;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    totalTokens: number;
    errorBreakdown: Record<string, number>;
  } {
    const now = Date.now();
    for (const [id, timing] of this.activeRequests) {
      if (now - timing.startTime > MetricsCollector.REQUEST_TIMEOUT_MS) {
        this.activeRequests.delete(id);
      }
    }

    const successRate =
      this.metrics.requests > 0 ? (this.metrics.successes / this.metrics.requests) * 100 : 0;

    const avgLatency =
      this.latencyBuffer.length > 0 ? this.latencyBuffer.sum / this.latencyBuffer.length : 0;

    return {
      requests: this.metrics.requests,
      successRate: Math.round(successRate * 100) / 100,
      avgLatency: Math.round(avgLatency * 100) / 100,
      minLatency: this.latencyBuffer.min === Infinity ? 0 : this.latencyBuffer.min,
      maxLatency: this.latencyBuffer.max,
      totalTokens: this.metrics.totalTokens,
      errorBreakdown: { ...this.metrics.errorTypes },
    };
  }

  reset(): void {
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      errorTypes: {},
      render: {
        totalFrames: 0,
        slowFrames: 0,
        avgFrameTimeMs: 0,
        maxFrameTimeMs: 0,
        totalFrameTimeMs: 0,
      },
    };
    this.activeRequests.clear();
    this.latencyBuffer.clear();
    this.tokenBuffer.clear();
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }
}

export const metricsCollector = new MetricsCollector();
