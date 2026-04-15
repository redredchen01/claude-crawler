import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { initializeDatabase } from "./db/index.js";
import { queue, getQueueHealth } from "./queue/index.js";
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
} from "./middleware/metrics.js";
import projectsRouter from "./api/projects.js";
import jobsRouter from "./api/jobs.js";
import clustersRouter from "./api/clusters.js";
import exportRouter from "./api/export.js";
import apiKeysRouter from "./api/apiKeys.js";
import webhooksRouter from "./api/webhooks.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";

const app = new Hono();

// ============= Middleware =============
app.use(logger());
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "x-user-id", "x-api-key"],
  }),
);

// ============= Health Check (no auth) =============
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============= Queue Status (no auth) =============
app.get("/api/queue/status", (c) => {
  const health = getQueueHealth();
  return c.json(health);
});

// ============= Metrics (no auth) =============
app.get("/metrics", async (c) => {
  c.header("Content-Type", register.contentType);
  return c.text(await register.metrics());
});

// ============= Apply API Key Auth Middleware =============
// This applies to all routes except health and queue status
app.use("/**", apiKeyAuth);

// ============= API Routes =============
app.route("/api/projects", projectsRouter);
app.route("/api/jobs", jobsRouter);
app.route("/api/clusters", clustersRouter);
app.route("/api/export", exportRouter);
app.route("/api/keys", apiKeysRouter);
app.route("/api/webhooks", webhooksRouter);

// ============= 404 Handler =============
app.notFound((c) => {
  return c.json({ code: "NOT_FOUND", message: "Route not found" }, 404);
});

// ============= Error Handler =============
app.onError((error, c) => {
  console.error("[Hono Error]", error);
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "An error occurred",
    },
    500,
  );
});

// ============= Readiness Probe (no auth) =============
app.get("/ready", async (c) => {
  const checks: { db: boolean; queue: boolean } = { db: false, queue: false };

  // DB check: simple select
  try {
    await initializeDatabase();
    checks.db = true;
  } catch {
    checks.db = false;
  }

  // Queue check: not paused
  checks.queue = !getQueueHealth().isPaused;

  const isReady = checks.db && checks.queue;
  return c.json(
    { status: isReady ? "ready" : "not_ready", checks },
    isReady ? 200 : 503,
  );
});

// ============= Server Startup =============
async function start() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log("✓ Database initialized");

    // Start server
    const port = process.env.PORT || 8000;
    console.log(`\n🚀 Server starting on port ${port}`);
    console.log(`   API: http://localhost:${port}/api`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   Ready: http://localhost:${port}/ready`);
    console.log(`   Queue Status: http://localhost:${port}/api/queue/status\n`);

    // Run Hono server - using Web standard Request/Response
    const http = await import("http");
    const server = http.createServer(async (req, res) => {
      try {
        // Create a Web standard Request from Node request
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const init: RequestInit = {
          method: req.method,
          headers: req.headers as Record<string, string>,
        };

        // Handle request body
        if (
          req.method !== "GET" &&
          req.method !== "HEAD" &&
          req.method !== "OPTIONS"
        ) {
          init.body = req;
        }

        const webReq = new Request(url, init);
        const response = await app.fetch(webReq);

        // Write response headers
        res.writeHead(response.status, Object.fromEntries(response.headers));

        // Stream response body
        if (response.body) {
          const reader = response.body.getReader();
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read();
            if (done) return;
            res.write(value);
            return pump();
          };
          await pump();
        }
        res.end();
      } catch (err) {
        console.error("[Hono] Request error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
        }
        res.end("Internal Server Error");
      }
    });
    server.listen(parseInt(port as string), () => {
      console.log("[Hono] Server listening on http://localhost:" + port);
    });

    // 1. Unhandled rejection/exception protection
    process.on("uncaughtException", (error) => {
      console.error("[Process] Uncaught exception:", error);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[Process] Unhandled rejection:", reason);
      process.exit(1);
    });

    // 2. Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[Server] ${signal} received, shutting down gracefully...`);

      // Pause queue — stop accepting new jobs
      queue.pause();

      // Wait for active jobs to complete (max 30s)
      const drainTimeout = setTimeout(() => {
        console.warn("[Server] Drain timeout — forcing shutdown");
        process.exit(1);
      }, 30_000);

      try {
        await queue.onIdle();
        clearTimeout(drainTimeout);
        console.log("[Server] Queue drained — exiting");
        process.exit(0);
      } catch (err) {
        console.error("[Server] Shutdown error:", err);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

export default app;
