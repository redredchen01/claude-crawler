import { serve } from "@hono/node-server";
import app from "./server";
import { healthCheckService } from "./services/healthCheckService";
import { loggerService } from "./services/loggerService";
import { metricsService } from "./services/metricsService";

const port = parseInt(process.env.API_PORT || "3001");

// Initialize services
loggerService.getLogger().info("Initializing SEO Crawler Backend...", {
  type: "startup",
  port,
  environment: process.env.NODE_ENV || "development",
});

// Initialize health check service (starts background monitoring)
loggerService.getLogger().info("Health check service started", {
  type: "startup",
});

// Start server
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    loggerService
      .getLogger()
      .info(`✅ Server running on http://localhost:${port}`, {
        type: "startup",
        port,
        host: info.address,
      });

    console.log(`\n🚀 SEO Crawler Backend v1.0.0`);
    console.log(`📊 Metrics: http://localhost:${port}/metrics`);
    console.log(`❤️  Health: http://localhost:${port}/health`);
    console.log(`📋 Status: http://localhost:${port}/status`);
    console.log(`🔐 Auth: POST http://localhost:${port}/auth/register`);
    console.log(`\n`);
  },
);

// Graceful shutdown
process.on("SIGTERM", () => {
  loggerService.getLogger().warn("SIGTERM received, shutting down gracefully", {
    type: "shutdown",
  });
  process.exit(0);
});

process.on("SIGINT", () => {
  loggerService.getLogger().warn("SIGINT received, shutting down gracefully", {
    type: "shutdown",
  });
  process.exit(0);
});
