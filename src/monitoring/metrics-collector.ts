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
  };

  private activeRequests = new Map<string, RequestTiming>();

  startRequest(requestId: string): void {
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
    });
  }

  endRequest(requestId: string, success: boolean, errorType?: string, tokens?: { prompt: number; completion: number }): void {
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
        this.metrics.errorTypes[timing.errorType] = (this.metrics.errorTypes[timing.errorType] || 0) + 1;
      }
    }

    if (timing.tokens) {
      this.metrics.promptTokens += timing.tokens.prompt;
      this.metrics.completionTokens += timing.tokens.completion;
      this.metrics.totalTokens += timing.tokens.prompt + timing.tokens.completion;
    }
  }

  recordToolCall(duration: number, success: boolean, toolName: string): void {
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
    const successRate = this.metrics.requests > 0 
      ? (this.metrics.successes / this.metrics.requests) * 100 
      : 0;
    
    const avgLatency = this.metrics.requests > 0 
      ? this.metrics.totalLatency / this.metrics.requests 
      : 0;

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
    };
    this.activeRequests.clear();
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }
}

export const metricsCollector = new MetricsCollector();
