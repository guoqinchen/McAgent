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
  /** Render performance metrics (for TUI) */
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

export class MetricsCollector {
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

  private activeRequests = new Map<string, RequestTiming>();
  private static readonly MAX_ACTIVE_REQUESTS = 100;
  private static readonly REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  startRequest(requestId: string): void {
    // Prevent unbounded growth from leaked entries (crashed/aborted requests)
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
    this.metrics.totalLatency += latency;
    this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);

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
      this.metrics.promptTokens += timing.tokens.prompt;
      this.metrics.completionTokens += timing.tokens.completion;
      this.metrics.totalTokens += timing.tokens.prompt + timing.tokens.completion;
    }
  }

  recordToolCall(duration: number, success: boolean, _toolName: string): void {
    this.metrics.requests++;
    this.metrics.totalLatency += duration;
    this.metrics.minLatency = Math.min(this.metrics.minLatency, duration);
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, duration);

    if (success) {
      this.metrics.successes++;
    } else {
      this.metrics.failures++;
      this.metrics.errorTypes['tool_call'] = (this.metrics.errorTypes['tool_call'] || 0) + 1;
    }
  }

  /** Track a single render frame for TUI performance monitoring. */
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

  /** Get the slow-frame ratio (frames over 32ms / total frames). */
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
    // Evict stale active requests (e.g., from crashed/aborted operations)
    const now = Date.now();
    for (const [id, timing] of this.activeRequests) {
      if (now - timing.startTime > MetricsCollector.REQUEST_TIMEOUT_MS) {
        this.activeRequests.delete(id);
      }
    }

    const successRate =
      this.metrics.requests > 0 ? (this.metrics.successes / this.metrics.requests) * 100 : 0;

    const avgLatency =
      this.metrics.requests > 0 ? this.metrics.totalLatency / this.metrics.requests : 0;

    return {
      requests: this.metrics.requests,
      successRate: Math.round(successRate * 100) / 100,
      avgLatency: Math.round(avgLatency * 100) / 100,
      minLatency: this.metrics.minLatency === Infinity ? 0 : this.metrics.minLatency,
      maxLatency: this.metrics.maxLatency,
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
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }
}

export const metricsCollector = new MetricsCollector();
