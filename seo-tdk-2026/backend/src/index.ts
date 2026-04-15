/**
 * TDK Optimizer Main Server Entry Point
 * Using rule-based TDK generation (no external API required)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { initializeDatabase } from "./db/index.js";
import { analyticsRouter } from "./api/analytics.js";
import { createDefaultTdkRouter } from "./api/tdk.js";

const app = new Hono();

// Port configuration
const PORT = process.env.PORT || 8000;

// Initialize database on startup
async function startServer() {
  console.log("🚀 Initializing database...");
  try {
    await initializeDatabase();
    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }

  // Create TDK router (using rule-based generation - no API key required)
  const tdkRouter = createDefaultTdkRouter();

  // Mount routes
  app.route("/api", tdkRouter);
  app.route("/api", analyticsRouter);

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Root endpoint
  app.get("/", (c) => {
    return c.json({
      name: "TDK Optimizer API",
      version: "0.1.0",
      status: "running",
      mode: "rule-based (no API key required)",
      endpoints: {
        health: "GET /health",
        analytics: "GET /api/projects/:projectId/analytics/*",
        tdk: "POST/GET /api/projects/:projectId/clusters/:clusterId/tdk*",
      },
    });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          message: "Not Found",
          code: "NOT_FOUND",
        },
      },
      404,
    );
  });

  // Start server
  console.log(`\n📡 Starting server on http://localhost:${PORT}`);
  console.log(`\n🔌 Available endpoints:`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Root: http://localhost:${PORT}/`);
  console.log(
    `  Analytics: http://localhost:${PORT}/api/projects/{projectId}/analytics/overview`,
  );
  console.log(
    `  TDK: http://localhost:${PORT}/api/projects/{projectId}/clusters/{clusterId}/tdk\n`,
  );

  serve({
    fetch: app.fetch,
    port: parseInt(String(PORT), 10),
  });
}

startServer().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});
