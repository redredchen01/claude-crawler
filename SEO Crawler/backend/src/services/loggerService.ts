import winston from "winston";

/**
 * Logger Service - Structured logging with Winston
 * Provides consistent, queryable logs with context metadata
 */
export class LoggerService {
  private logger: winston.Logger;

  constructor() {
    const isDev = process.env.NODE_ENV !== "production";

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
      format: winston.format.combine(
        winston.format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
        winston.format.errors({ stack: true }),
        winston.format.metadata(),
        isDev ? winston.format.colorize() : winston.format.json(),
      ),
      defaultMeta: {
        service: "seo-crawler-backend",
        environment: process.env.NODE_ENV || "development",
      },
      transports: [
        new winston.transports.Console({
          format: isDev
            ? winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(
                  ({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length
                      ? ` ${JSON.stringify(meta)}`
                      : "";
                    return `${timestamp} [${level}] ${message}${metaStr}`;
                  },
                ),
              )
            : winston.format.json(),
        }),
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
          format: winston.format.json(),
        }),
        new winston.transports.File({
          filename: "logs/combined.log",
          format: winston.format.json(),
        }),
      ],
    });
  }

  // Request logging
  logRequest(method: string, path: string, userId?: number, meta?: any): void {
    this.logger.info(`HTTP ${method} ${path}`, {
      type: "http_request",
      method,
      path,
      userId,
      ...meta,
    });
  }

  // Response logging
  logResponse(
    method: string,
    path: string,
    status: number,
    duration: number,
    userId?: number,
    meta?: any,
  ): void {
    const level = status >= 400 ? "warn" : "debug";
    this.logger[level as "warn" | "debug"](`HTTP ${method} ${path} ${status}`, {
      type: "http_response",
      method,
      path,
      status,
      duration,
      userId,
      ...meta,
    });
  }

  // Database operation logging
  logDbOperation(
    operation: string,
    table: string,
    duration: number,
    meta?: any,
  ): void {
    this.logger.debug(`DB ${operation} on ${table}`, {
      type: "db_operation",
      operation,
      table,
      duration,
      ...meta,
    });
  }

  // Claude API call logging
  logClaudeApiCall(
    analysisType: string,
    inputTokens: number,
    outputTokens: number,
    costUSD: number,
    duration: number,
    userId: number,
    meta?: any,
  ): void {
    this.logger.info(`Claude API call - ${analysisType}`, {
      type: "claude_api_call",
      analysisType,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD,
      duration,
      userId,
      ...meta,
    });
  }

  // Job event logging
  logJobEvent(
    jobId: string,
    event: string,
    status: string,
    userId: number,
    meta?: any,
  ): void {
    this.logger.info(`Job ${jobId}: ${event}`, {
      type: "job_event",
      jobId,
      event,
      status,
      userId,
      ...meta,
    });
  }

  // Webhook event logging
  logWebhookEvent(
    webhookId: string,
    event: string,
    status: string,
    duration?: number,
    meta?: any,
  ): void {
    this.logger.info(`Webhook ${webhookId}: ${event}`, {
      type: "webhook_event",
      webhookId,
      event,
      status,
      duration,
      ...meta,
    });
  }

  // Authentication event logging
  logAuthEvent(
    event: string,
    userId?: number,
    status?: string,
    meta?: any,
  ): void {
    this.logger.info(`Auth event: ${event}`, {
      type: "auth_event",
      event,
      userId,
      status,
      ...meta,
    });
  }

  // Quota-related logging
  logQuotaEvent(userId: number, event: string, meta?: any): void {
    this.logger.warn(`Quota event - ${event}`, {
      type: "quota_event",
      userId,
      event,
      ...meta,
    });
  }

  // Error logging
  logError(
    error: Error | string,
    context: string,
    userId?: number,
    meta?: any,
  ): void {
    if (error instanceof Error) {
      this.logger.error(`${context}: ${error.message}`, {
        type: "error",
        context,
        errorMessage: error.message,
        stack: error.stack,
        userId,
        ...meta,
      });
    } else {
      this.logger.error(`${context}: ${error}`, {
        type: "error",
        context,
        errorMessage: error,
        userId,
        ...meta,
      });
    }
  }

  // Performance warning
  logPerformanceWarning(
    operation: string,
    duration: number,
    threshold: number,
    meta?: any,
  ): void {
    if (duration > threshold) {
      this.logger.warn(
        `Slow ${operation}: ${duration}ms (threshold: ${threshold}ms)`,
        {
          type: "performance_warning",
          operation,
          duration,
          threshold,
          ...meta,
        },
      );
    }
  }

  // Get logger instance for custom use
  getLogger(): winston.Logger {
    return this.logger;
  }
}

// Singleton instance
export const loggerService = new LoggerService();
