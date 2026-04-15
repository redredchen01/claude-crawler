import { jobRepository } from "../repositories/jobRepository";
import { getClaudeService } from "./claudeAnalysisService";
import { loggerService } from "./loggerService";

interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: "up" | "down"; latency: number };
    claudeApi: { status: "up" | "down"; latency: number };
    memory: {
      usage: number;
      limit: number;
      status: "ok" | "warning" | "critical";
    };
  };
  alerts: string[];
}

/**
 * Health Check Service - Monitors system health
 * Provides liveness and readiness probes for orchestration
 */
export class HealthCheckService {
  private startTime = Date.now();
  private lastHealthCheck: HealthStatus | null = null;
  private healthCheckInterval = 30000; // 30 seconds

  // Thresholds
  private readonly MEMORY_WARNING_THRESHOLD = 0.75; // 75% usage
  private readonly MEMORY_CRITICAL_THRESHOLD = 0.9; // 90% usage
  private readonly DB_LATENCY_THRESHOLD = 1000; // 1 second
  private readonly CLAUDE_API_LATENCY_THRESHOLD = 5000; // 5 seconds

  constructor() {
    this.initializeHealthCheck();
  }

  private initializeHealthCheck(): void {
    // Run health check every 30 seconds
    setInterval(() => {
      this.performHealthCheck().catch((err) => {
        loggerService.logError(err, "Health check error");
      });
    }, this.healthCheckInterval);

    // Initial check
    this.performHealthCheck().catch((err) => {
      loggerService.logError(err, "Initial health check error");
    });
  }

  /**
   * Liveness probe - Is the service alive?
   * Should return true if the process is running, false only on fatal errors
   */
  async isAlive(): Promise<boolean> {
    try {
      // Simple check: process is running
      return true;
    } catch (error) {
      loggerService.logError(error as Error, "Liveness check failed");
      return false;
    }
  }

  /**
   * Readiness probe - Is the service ready to accept traffic?
   * Returns false if any critical dependency is unavailable
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.performHealthCheck();
      return health.status === "healthy" || health.status === "degraded";
    } catch (error) {
      loggerService.logError(error as Error, "Readiness check failed");
      return false;
    }
  }

  /**
   * Detailed health check
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();
    const alerts: string[] = [];

    // Database health
    const dbHealth = await this.checkDatabase();
    if (dbHealth.status === "down") {
      alerts.push("Database is unavailable");
    }
    if (dbHealth.latency > this.DB_LATENCY_THRESHOLD) {
      alerts.push(`Database latency high: ${dbHealth.latency}ms`);
    }

    // Claude API health
    const claudeHealth = await this.checkClaudeApi();
    if (claudeHealth.status === "down") {
      alerts.push("Claude API is unavailable");
    }
    if (claudeHealth.latency > this.CLAUDE_API_LATENCY_THRESHOLD) {
      alerts.push(`Claude API latency high: ${claudeHealth.latency}ms`);
    }

    // Memory health
    const memoryHealth = this.checkMemory();
    if (memoryHealth.status === "critical") {
      alerts.push(
        `Critical memory usage: ${(memoryHealth.usage * 100).toFixed(1)}%`,
      );
    } else if (memoryHealth.status === "warning") {
      alerts.push(
        `High memory usage: ${(memoryHealth.usage * 100).toFixed(1)}%`,
      );
    }

    // Determine overall status
    const criticalDown =
      dbHealth.status === "down" && claudeHealth.status === "down";
    const anyDown =
      dbHealth.status === "down" || claudeHealth.status === "down";

    const status: HealthStatus["status"] = criticalDown
      ? "unhealthy"
      : anyDown || memoryHealth.status === "critical"
        ? "degraded"
        : "healthy";

    const health: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {
        database: dbHealth,
        claudeApi: claudeHealth,
        memory: memoryHealth,
      },
      alerts,
    };

    this.lastHealthCheck = health;

    loggerService.getLogger().debug("Health check completed", {
      type: "health_check",
      status,
      alerts: alerts.length,
    });

    return health;
  }

  /**
   * Check database connectivity and latency
   */
  private async checkDatabase(): Promise<{
    status: "up" | "down";
    latency: number;
  }> {
    try {
      const start = Date.now();

      // Simple query to verify connection
      await jobRepository.getJob("0");

      const latency = Date.now() - start;
      return { status: "up", latency };
    } catch (error) {
      loggerService.logError(error as Error, "Database health check failed");
      return { status: "down", latency: -1 };
    }
  }

  /**
   * Check Claude API connectivity and latency
   */
  private async checkClaudeApi(): Promise<{
    status: "up" | "down";
    latency: number;
  }> {
    try {
      const start = Date.now();
      const claudeService = getClaudeService();
      const healthy = await claudeService.healthCheck();
      const latency = Date.now() - start;

      return { status: healthy ? "up" : "down", latency };
    } catch (error) {
      loggerService.logError(error as Error, "Claude API health check failed");
      return { status: "down", latency: -1 };
    }
  }

  /**
   * Check memory usage
   */
  private checkMemory(): {
    usage: number;
    limit: number;
    status: "ok" | "warning" | "critical";
  } {
    const used = process.memoryUsage().heapUsed;
    const limit = process.memoryUsage().heapTotal;
    const usage = used / limit;

    let status: "ok" | "warning" | "critical" = "ok";
    if (usage > this.MEMORY_CRITICAL_THRESHOLD) {
      status = "critical";
    } else if (usage > this.MEMORY_WARNING_THRESHOLD) {
      status = "warning";
    }

    return { usage, limit, status };
  }

  /**
   * Get last cached health check result
   */
  getLastHealthCheck(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Get service uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get service uptime in human readable format
   */
  getUptimeFormatted(): string {
    const uptime = this.getUptime();
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
}

// Singleton instance
export const healthCheckService = new HealthCheckService();
