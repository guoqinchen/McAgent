import * as fs from 'fs';
import * as path from 'path';
import { metricsCollector, MetricsCollector } from './metrics-collector.js';

export interface PerformanceReport {
  timestamp: Date;
  durationMinutes: number;
  requests: number;
  successRate: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  errorBreakdown: Record<string, number>;
}

export class PerformanceReporter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private reportIntervalMinutes: number;
  private reportDir: string;
  private collector: MetricsCollector;
  private lastReportTime: Date;

  constructor(collector: MetricsCollector = metricsCollector, reportIntervalMinutes: number = 10) {
    this.collector = collector;
    this.reportIntervalMinutes = reportIntervalMinutes;
    this.reportDir = path.join(process.env.HOME || '', '.mcagent', 'reports');
    this.lastReportTime = new Date();
    this.ensureDirectoryExists();
  }

  start(): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.generateReport();
    }, this.reportIntervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  generateReport(): PerformanceReport {
    const now = new Date();
    const durationMinutes = Math.round((now.getTime() - this.lastReportTime.getTime()) / 60000);
    
    const summary = this.collector.getSummary();
    const metrics = this.collector.getMetrics();

    const report: PerformanceReport = {
      timestamp: now,
      durationMinutes,
      requests: summary.requests,
      successRate: summary.successRate,
      avgLatencyMs: summary.avgLatency,
      minLatencyMs: summary.minLatency,
      maxLatencyMs: summary.maxLatency,
      totalTokens: summary.totalTokens,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      errorBreakdown: summary.errorBreakdown,
    };

    this.saveReport(report);
    this.lastReportTime = now;

    return report;
  }

  generateDetailedReport(): string {
    const report = this.generateReport();
    
    let output = `\n=== Performance Report ===\n`;
    output += `Timestamp: ${report.timestamp.toISOString()}\n`;
    output += `Duration: ${report.durationMinutes} minutes\n`;
    output += `\n--- Request Metrics ---\n`;
    output += `Total Requests: ${report.requests}\n`;
    output += `Success Rate: ${report.successRate}%\n`;
    output += `\n--- Latency Metrics ---\n`;
    output += `Average Latency: ${report.avgLatencyMs}ms\n`;
    output += `Minimum Latency: ${report.minLatencyMs}ms\n`;
    output += `Maximum Latency: ${report.maxLatencyMs}ms\n`;
    output += `\n--- Token Metrics ---\n`;
    output += `Total Tokens: ${report.totalTokens}\n`;
    output += `Prompt Tokens: ${report.promptTokens}\n`;
    output += `Completion Tokens: ${report.completionTokens}\n`;
    
    if (Object.keys(report.errorBreakdown).length > 0) {
      output += `\n--- Error Breakdown ---\n`;
      for (const [errorType, count] of Object.entries(report.errorBreakdown)) {
        output += `${errorType}: ${count}\n`;
      }
    }
    
    output += `========================\n`;
    
    return output;
  }

  private saveReport(report: PerformanceReport): void {
    const fileName = `performance-${report.timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(this.reportDir, fileName);
    
    const data = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, data);
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  getRecentReports(count: number = 5): PerformanceReport[] {
    try {
      const files = fs.readdirSync(this.reportDir);
      const reportFiles = files
        .filter(f => f.startsWith('performance-') && f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, count);

      return reportFiles.map(file => {
        const content = fs.readFileSync(path.join(this.reportDir, file), 'utf-8');
        const parsed = JSON.parse(content);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });
    } catch {
      return [];
    }
  }
}

export const performanceReporter = new PerformanceReporter();
