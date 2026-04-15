import { Hono } from "hono";
import { getDatabase, getSQLiteInstance } from "../db/index.js";
import { CreateJobRequestSchema } from "../types/index.js";
import { getTaskQueue } from "../queue/taskQueue.js";
import { resultsCache } from "../services/resultsCache.js";
const router = new Hono();
// ============== POST /api/jobs - 创建任务 ==============
router.post("/", async (c) => {
  try {
    const body = await c.req.json();
    // 验证请求体
    const validation = CreateJobRequestSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: "Validation Error",
          message: "Invalid request body",
          status: 400,
          details: validation.error.errors,
        },
        400,
      );
    }
    const { seed, sources, competitorUrls } = validation.data;
    const db = getDatabase();
    // 生成任务 ID
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sourcesStr = sources.join(",");
    const now = Math.floor(Date.now() / 1000);
    // 直接使用 SQL INSERT，因为 Drizzle 尚未完全集成
    const sqlite = getSQLiteInstance();
    const insertStmt = sqlite.prepare(`
      INSERT INTO keyword_jobs (id, seed, sources, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStmt.run(jobId, seed, sourcesStr, "waiting", now);
    // 入队任务到后台处理队列
    const queue = getTaskQueue();
    queue
      .enqueueTask({
        jobId,
        seed,
        sources,
        competitorUrls,
      })
      .catch((error) => {
        console.error(`[API] Failed to enqueue task ${jobId}:`, error);
        // 更新任务状态为失败
        sqlite
          .prepare(
            "UPDATE keyword_jobs SET status = ?, error_message = ? WHERE id = ?",
          )
          .run(
            "failed",
            error instanceof Error ? error.message : String(error),
            jobId,
          );
      });
    const response = {
      id: jobId,
      seed,
      sources,
      status: "waiting",
      createdAt: now,
    };
    return c.json(response, 201);
  } catch (error) {
    console.error("[POST /jobs Error]", error);
    return c.json(
      {
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to create job",
        status: 500,
      },
      500,
    );
  }
});
// ============== GET /api/jobs - 列出任务 ==============
router.get("/", async (c) => {
  try {
    const db = getDatabase();
    const sqlite = getSQLiteInstance();
    const page = parseInt(c.req.query("page") || "1");
    const pageSize = parseInt(c.req.query("pageSize") || "10");
    const offset = (page - 1) * pageSize;
    // 获取总数
    const countResult = sqlite
      .prepare("SELECT COUNT(*) as count FROM keyword_jobs")
      .get();
    // 获取分页数据
    const jobs = sqlite
      .prepare(
        `
        SELECT id, seed, sources, status, created_at as createdAt, finished_at as finishedAt, error_message as errorMessage
        FROM keyword_jobs
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(pageSize, offset);
    const response = {
      jobs: jobs.map((job) => ({
        id: job.id,
        seed: job.seed,
        sources: job.sources.split(","),
        status: job.status,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt || undefined,
        errorMessage: job.errorMessage || undefined,
      })),
      total: countResult.count,
      page,
      pageSize,
    };
    // ✓ Unit 4: 添加HTTP缓存头
    c.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return c.json(response);
  } catch (error) {
    console.error("[GET /jobs Error]", error);
    return c.json(
      {
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to fetch jobs",
        status: 500,
      },
      500,
    );
  }
});
// ============== GET /api/jobs/:id - 获取任务详情 ==============
router.get("/:id", async (c) => {
  try {
    const jobId = c.req.param("id");
    const db = getDatabase();
    const sqlite = getSQLiteInstance();
    const job = sqlite
      .prepare(
        `
        SELECT id, seed, sources, status, created_at as createdAt, finished_at as finishedAt, error_message as errorMessage
        FROM keyword_jobs
        WHERE id = ?
      `,
      )
      .get(jobId);
    if (!job) {
      return c.json(
        {
          error: "Not Found",
          message: `Job ${jobId} not found`,
          status: 404,
        },
        404,
      );
    }
    const response = {
      id: job.id,
      seed: job.seed,
      sources: job.sources.split(","),
      status: job.status,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt || undefined,
      errorMessage: job.errorMessage || undefined,
    };
    return c.json(response);
  } catch (error) {
    console.error("[GET /jobs/:id Error]", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch job",
        status: 500,
      },
      500,
    );
  }
});
// ============== GET /api/jobs/:id/results - 获取关键词结果 ==============
router.get("/:id/results", async (c) => {
  try {
    const jobId = c.req.param("id");
    const page = parseInt(c.req.query("page") || "1");
    const pageSize = parseInt(c.req.query("pageSize") || "25");
    const offset = (page - 1) * pageSize;
    const db = getDatabase();
    const sqlite = getSQLiteInstance();

    // ✓ Unit 3: 检查缓存
    const cached = resultsCache.get(jobId, page, pageSize);
    if (cached) {
      // Unit 4: 添加缓存头
      c.header("Cache-Control", "public, max-age=120, s-maxage=300");
      c.header("X-Cache", "HIT");
      return c.json(cached);
    }

    // 验证任务存在
    const job = sqlite
      .prepare("SELECT id FROM keyword_jobs WHERE id = ?")
      .get(jobId);
    if (!job) {
      return c.json(
        {
          error: "Not Found",
          message: `Job ${jobId} not found`,
          status: 404,
        },
        404,
      );
    }
    // 获取总数
    const countResult = sqlite
      .prepare("SELECT COUNT(*) as count FROM keyword_results WHERE job_id = ?")
      .get(jobId);
    // 获取分页数据
    const results = sqlite
      .prepare(
        `
        SELECT id, source, raw_keyword as rawKeyword, normalized_keyword as normalizedKeyword, intent, score, created_at as createdAt
        FROM keyword_results
        WHERE job_id = ?
        ORDER BY score DESC, created_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(jobId, pageSize, offset);

    const response = {
      jobId,
      keywords: results,
      total: countResult.count,
      page,
      pageSize,
    };

    // ✓ Unit 3: 缓存结果
    resultsCache.set(jobId, page, pageSize, response);

    // ✓ Unit 4: 添加HTTP缓存头
    c.header("Cache-Control", "public, max-age=120, s-maxage=300");
    c.header("X-Cache", "MISS");
    return c.json(response);
  } catch (error) {
    console.error("[GET /jobs/:id/results Error]", error);
    return c.json(
      {
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to fetch results",
        status: 500,
      },
      500,
    );
  }
});
// ============== GET /api/jobs/:id/export/csv - 导出 CSV ==============
router.get("/:id/export/csv", async (c) => {
  try {
    const jobId = c.req.param("id");
    const db = getDatabase();
    const sqlite = getSQLiteInstance();
    // 验证任务存在
    const job = sqlite
      .prepare("SELECT seed FROM keyword_jobs WHERE id = ?")
      .get(jobId);
    if (!job) {
      return c.json(
        {
          error: "Not Found",
          message: `Job ${jobId} not found`,
          status: 404,
        },
        404,
      );
    }
    // 获取所有结果
    const results = sqlite
      .prepare(
        `
        SELECT source, raw_keyword, normalized_keyword, intent, score, created_at
        FROM keyword_results
        WHERE job_id = ?
        ORDER BY score DESC, created_at DESC
      `,
      )
      .all(jobId);
    // 构造 CSV
    const headers = [
      "source",
      "raw_keyword",
      "normalized_keyword",
      "intent",
      "score",
      "created_at",
    ];
    const csvLines = [];
    // CSV 头
    csvLines.push(headers.map((h) => `"${h}"`).join(","));
    // CSV 行
    results.forEach((result) => {
      const row = [
        result.source,
        result.raw_keyword,
        result.normalized_keyword,
        result.intent,
        result.score,
        new Date(result.created_at * 1000).toISOString(),
      ];
      csvLines.push(
        row
          .map((cell) => {
            const str = String(cell || "");
            // 如果包含逗号、引号或换行，需要转义
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return `"${str}"`;
          })
          .join(","),
      );
    });
    const csv = csvLines.join("\n");
    // 返回 CSV 文件
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="keywords-${jobId}.csv"`,
    );
    return c.text(csv);
  } catch (error) {
    console.error("[GET /jobs/:id/export/csv Error]", error);
    return c.json(
      {
        error: "Internal Server Error",
        message:
          error instanceof Error ? error.message : "Failed to export CSV",
        status: 500,
      },
      500,
    );
  }
});
export default router;
//# sourceMappingURL=jobs.js.map
