import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { monitoringMiddleware } from "./middleware/monitoringMiddleware";
import { loggerService } from "./services/loggerService";
// Import routers
import authRouter from "./routes/auth";
import analysisRouter from "./routes/analysis";
import monitoringRouter from "./routes/monitoring";
const app = new Hono();
// ============== 中间件 ==============
// CORS 中间件
app.use("*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
}));
// Hono 内置日志中间件
app.use("*", logger());
// 自定义监控中间件 - 用于 Prometheus 指标收集
app.use("*", monitoringMiddleware);
// ============== 错误处理中间件 ==============
app.onError((err, c) => {
    loggerService.logError(err, "API Error");
    if (err instanceof Error) {
        return c.json({
            error: "Internal Server Error",
            message: err.message,
            status: 500,
        }, 500);
    }
    return c.json({
        error: "Unknown Error",
        message: "An unexpected error occurred",
        status: 500,
    }, 500);
});
// ============== 路由 ==============
// 监控和健康检查 - 无需认证
app.route("/metrics", monitoringRouter);
app.route("/health", monitoringRouter);
app.route("/ready", monitoringRouter);
app.route("/status", monitoringRouter);
// 认证路由
app.route("/auth", authRouter);
// 分析路由 - Claude API 调用
app.route("/api/analysis", analysisRouter);
// ============== 404 处理 ==============
app.notFound((c) => {
    return c.json({
        error: "Not Found",
        message: `Route ${c.req.path} not found`,
        status: 404,
    }, 404);
});
export default app;
//# sourceMappingURL=server.js.map