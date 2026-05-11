/**
 * Structured logging utility
 * Production-grade logging with trace IDs and structured output
 */

import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  trace_id: string;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface LoggerOptions {
  service: string;
  minLevel: LogLevel;
  enableConsole: boolean;
  // Could add: enableFile, filePath, enableMetrics, etc.
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private options: LoggerOptions;
  private currentTraceId: string | null = null;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      service: options.service || 'veritas',
      minLevel: options.minLevel || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      enableConsole: options.enableConsole ?? true,
      ...options,
    };
  }

  /**
   * Set trace ID for the current context
   */
  setTraceId(traceId: string): void {
    this.currentTraceId = traceId;
  }

  /**
   * Clear trace ID
   */
  clearTraceId(): void {
    this.currentTraceId = null;
  }

  /**
   * Get or create trace ID
   */
  private getTraceId(): string {
    return this.currentTraceId || randomUUID();
  }

  /**
   * Check if we should log at this level
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.options.minLevel];
  }

  /**
   * Create log entry
   */
  private createEntry(
    level: LogLevel,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.options.service,
      trace_id: this.getTraceId(),
      component,
      message,
      metadata,
    };
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (!this.options.enableConsole) return;

    const logFn = entry.level === 'error' ? console.error
      : entry.level === 'warn' ? console.warn
      : entry.level === 'debug' ? console.debug
      : console.log;

    // In production, output JSON for log aggregation
    if (process.env.NODE_ENV === 'production') {
      logFn(JSON.stringify(entry));
    } else {
      // Development: pretty print
      const meta = entry.metadata ? ` | ${JSON.stringify(entry.metadata)}` : '';
      logFn(`[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.component} - ${entry.message}${meta}`);
    }
  }

  /**
   * Public log methods
   */
  debug(component: string, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.createEntry('debug', component, message, metadata));
  }

  info(component: string, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    this.output(this.createEntry('info', component, message, metadata));
  }

  warn(component: string, message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    this.output(this.createEntry('warn', component, message, metadata));
  }

  error(component: string, message: string, error?: Error, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const errorMetadata = error ? {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      ...metadata,
    } : metadata;
    this.output(this.createEntry('error', component, message, errorMetadata));
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LoggerOptions>): Logger {
    const childLogger = new Logger({
      ...this.options,
      ...additionalContext,
    });
    childLogger.setTraceId(this.getTraceId());
    return childLogger;
  }
}

// Global logger instance
export const logger = new Logger({
  service: 'veritas',
  minLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
});

/**
 * Create a logger for a specific component
 */
export function createComponentLogger(component: string): Logger {
  return new Logger({
    service: 'veritas',
    minLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
  }).child({ service: `veritas:${component}` });
}

/**
 * Async local storage for trace context (Node.js 14.8+)
 */
export class TraceContext {
  private static storage = new Map<string, string>();

  static set(key: string, traceId: string): void {
    TraceContext.storage.set(key, traceId);
  }

  static get(key: string): string | undefined {
    return TraceContext.storage.get(key);
  }

  static clear(key: string): void {
    TraceContext.storage.delete(key);
  }

  static runWithTrace<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
    const key = `trace:${process.pid}:${Date.now()}`;
    TraceContext.set(key, traceId);
    return fn().finally(() => TraceContext.clear(key));
  }
}
