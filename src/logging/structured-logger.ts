import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from '../config/resolver.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogRecord {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface LogHandler {
  handle(record: LogRecord): void;
  setLevel(level: LogLevel): void;
}

export class ConsoleHandler implements LogHandler {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  handle(record: LogRecord): void {
    if (!this.shouldLog(record.level)) return;

    const timestamp = record.timestamp.toISOString();
    const level = record.level.toUpperCase().padEnd(5);
    let message = `[${timestamp}] [${level}] ${record.message}`;

    if (record.context && Object.keys(record.context).length > 0) {
      message += ` ${JSON.stringify(record.context)}`;
    }

    if (record.error) {
      message += `\n${record.error.stack}`;
    }

    const stream = this.getStream(record.level);
    stream.write(message + '\n');
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private getStream(level: LogLevel): NodeJS.WritableStream {
    if (level === 'error' || level === 'fatal') {
      return process.stderr;
    }
    return process.stdout;
  }
}

export class FileHandler implements LogHandler {
  private level: LogLevel;
  private filePath: string;
  private writeQueue: string[] = [];
  private flushing = false;

  constructor(filePath: string, level: LogLevel = 'info') {
    this.filePath = filePath;
    this.level = level;
    this.ensureDirectoryExists();
  }

  handle(record: LogRecord): void {
    if (!this.shouldLog(record.level)) return;

    const logEntry = JSON.stringify({
      timestamp: record.timestamp.toISOString(),
      level: record.level,
      message: record.message,
      context: record.context,
      error: record.error?.message,
      stack: record.error?.stack,
    });

    // Queue the write — never block the event loop with sync file I/O
    this.writeQueue.push(logEntry + '\n');
    this.scheduleFlush();
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private scheduleFlush(): void {
    if (this.flushing) return;
    this.flushing = true;
    // Use microtask so writes happen asynchronously without blocking
    queueMicrotask(() => this.flush());
  }

  private async flush(): Promise<void> {
    while (this.writeQueue.length > 0) {
      const batch = this.writeQueue.splice(0);
      try {
        await fs.promises.appendFile(this.filePath, batch.join(''), 'utf-8');
      } catch {
        // Fallback: sync write if async fails (non-blocking design priority)
        try {
          fs.appendFileSync(this.filePath, batch.join(''), 'utf-8');
        } catch {
          // Silently drop log writes on failure — logging must never crash
        }
      }
    }
    this.flushing = false;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export class StructuredLogger {
  private handlers: LogHandler[] = [];
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    this.handlers.forEach((h) => h.setLevel(level));
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('fatal', message, context, error);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.shouldLog(level)) return;

    const record: LogRecord = {
      timestamp: new Date(),
      level,
      message,
      context,
      error,
    };

    this.handlers.forEach((handler) => handler.handle(record));
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

const createDefaultLogger = (): StructuredLogger => {
  const logger = new StructuredLogger('info');

  const consoleHandler = new ConsoleHandler('info');
  logger.addHandler(consoleHandler);

  const logDir = path.join(getConfigDir(), 'logs');
  const logFile = path.join(logDir, `mcagent-${new Date().toISOString().split('T')[0]}.log`);
  const fileHandler = new FileHandler(logFile, 'debug');
  logger.addHandler(fileHandler);

  return logger;
};

export const logger = createDefaultLogger();
