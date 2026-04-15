import PQueue from "p-queue";
import { getSQLiteInstance } from "../db/index.js";
import {
  GoogleSuggestProvider,
  BingSuggestProvider,
} from "../crawler/suggestProvider.js";
import { CompetitorExtractor } from "../crawler/competitorExtractor.js";
import {
  normalizeAndDeduplicate,
  normalizeKeyword,
} from "../services/normalizationService.js";
import { classifyKeywords } from "../services/classificationService.js";
import { scoreKeywords } from "../services/scoringService.js";
import { resultsCache } from "../services/resultsCache.js";
/**
 * 任务队列管理器
 * - 使用 p-queue 控制并发（2-3 workers）
 * - 集成爬虫和数据管道服务
 * - 持久化到数据库
 */
export class TaskQueue {
  constructor(maxConcurrent = 2) {
    this.queue = new PQueue({ concurrency: maxConcurrent });
    this.sqlite = getSQLiteInstance();
  }
  /**
   * 入队任务
   */
  async enqueueTask(job) {
    await this.queue.add(async () => {
      try {
        await this.executeTask(job);
      } catch (error) {
        console.error(`[TaskQueue] Task ${job.jobId} failed:`, error);
        this.updateJobStatus(
          job.jobId,
          "failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }
  /**
   * 执行单个任务
   */
  async executeTask(job) {
    const startTime = Date.now();
    // 更新状态为 running
    this.updateJobStatus(job.jobId, "running");
    const allKeywords = [];
    // 步骤 1: 并发采集关键词 - 从搜索引擎建议
    const providerResults = await Promise.allSettled(
      job.sources.map(async (source) => {
        const provider =
          source === "google"
            ? new GoogleSuggestProvider()
            : new BingSuggestProvider();
        const suggestions = await provider.fetchSuggestions(job.seed);
        return { source, suggestions };
      }),
    );
    for (const result of providerResults) {
      if (result.status === "fulfilled") {
        const { source, suggestions } = result.value;
        for (const keyword of suggestions) {
          allKeywords.push({ source, keyword });
        }
      } else {
        console.warn(`[TaskQueue] Failed to crawl source:`, result.reason);
      }
    }
    // 步骤 1b: 采集关键词 - 从竞争对手页面
    if (job.competitorUrls && job.competitorUrls.length > 0) {
      try {
        const extractor = new CompetitorExtractor();
        const competitorKeywords = await extractor.extractFromUrls(
          job.competitorUrls,
        );
        for (const keyword of competitorKeywords) {
          allKeywords.push({ source: "competitor", keyword });
        }
      } catch (error) {
        console.warn(
          `[TaskQueue] Failed to extract from competitor URLs:`,
          error,
        );
        // 继续处理
      }
    }
    if (allKeywords.length === 0) {
      throw new Error(`No keywords found for seed: ${job.seed}`);
    }
    // 步骤 2: 规范化和去重，同时追踪源
    const { normalized, mapping } = normalizeAndDeduplicate(
      allKeywords.map((kw) => kw.keyword),
    );
    // 构建规范化关键词 -> 源集合的映射
    const sourceMapping = new Map();
    for (const kw of allKeywords) {
      const normKeyword = normalizeKeyword(kw.keyword);
      if (normKeyword) {
        if (!sourceMapping.has(normKeyword)) {
          sourceMapping.set(normKeyword, new Set());
        }
        sourceMapping.get(normKeyword).add(kw.source);
      }
    }
    // 步骤 3: 分类
    const classified = classifyKeywords(normalized);
    // 步骤 4: 评分 - 为每个源单独评分
    const scoredBySource = new Map();
    for (let i = 0; i < normalized.length; i++) {
      const norm = normalized[i];
      const classif = classified[i];
      const sources = sourceMapping.get(norm) || new Set();
      for (const source of sources) {
        const scored = scoreKeywords([
          {
            keyword: norm,
            source: source,
          },
        ]);
        const score = scored[0].score;
        if (!scoredBySource.has(norm)) {
          scoredBySource.set(norm, new Map());
        }
        scoredBySource.get(norm).set(source, score);
      }
    }
    // 步骤 5: 写入数据库 - 为每个源创建单独记录
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < normalized.length; i++) {
      const norm = normalized[i];
      const classif = classified[i];
      const raws = mapping.get(norm) || [];
      const sourceScores = scoredBySource.get(norm) || new Map();
      // 为每个源创建单独的记录
      for (const [source, score] of sourceScores.entries()) {
        const insertStmt = this.sqlite.prepare(`
          INSERT INTO keyword_results (id, job_id, source, raw_keyword, normalized_keyword, intent, score, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          job.jobId,
          source,
          raws[0] || norm,
          norm,
          classif.intent,
          score,
          now,
        );
      }
    }
    // 步骤 6: 更新任务为完成
    const finishedAt = Math.floor(Date.now() / 1000);
    this.updateJobStatus(job.jobId, "completed");
    this.sqlite
      .prepare("UPDATE keyword_jobs SET finished_at = ? WHERE id = ?")
      .run(finishedAt, job.jobId);
    // ✓ Unit 3: 任务完成时清除缓存
    resultsCache.clearJobCache(job.jobId);
    const duration = (Date.now() - startTime) / 1000;
    console.log(
      `[TaskQueue] Task ${job.jobId} completed in ${duration}s (${normalized.length} keywords)`,
    );
  }
  /**
   * 更新任务状态
   */
  updateJobStatus(jobId, status, errorMessage) {
    if (errorMessage) {
      this.sqlite
        .prepare(
          "UPDATE keyword_jobs SET status = ?, error_message = ? WHERE id = ?",
        )
        .run(status, errorMessage, jobId);
    } else {
      this.sqlite
        .prepare("UPDATE keyword_jobs SET status = ? WHERE id = ?")
        .run(status, jobId);
    }
  }
  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
    };
  }
}
// 全局队列实例
let globalQueue = null;
export function getTaskQueue(maxConcurrent) {
  if (!globalQueue) {
    globalQueue = new TaskQueue(maxConcurrent || 2);
  }
  return globalQueue;
}
//# sourceMappingURL=taskQueue.js.map
