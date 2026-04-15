/**
 * JobStatusWatcher - 监控任务状态变化
 *
 * 定期轮询所有任务，检测状态变化并发出事件
 */

class JobStatusWatcher {
  constructor(db, eventBus) {
    this.db = db;
    this.eventBus = eventBus;
    this.watchInterval = 1000; // 1秒轮询一次
    this.pollTimer = null;
    this.previousStates = new Map(); // 记录上一次的状态
  }

  /**
   * 启动状态监控
   * @param {number} interval - 轮询间隔（毫秒）
   */
  start(interval = this.watchInterval) {
    if (this.pollTimer) {
      console.warn("[JobStatusWatcher] Already running, call stop() first");
      return;
    }

    this.watchInterval = interval;
    console.log(`[JobStatusWatcher] Started with ${interval}ms interval`);

    // 立即执行一次
    this.poll();

    // 定期轮询
    this.pollTimer = setInterval(() => this.poll(), this.watchInterval);
  }

  /**
   * 停止状态监控
   */
  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log("[JobStatusWatcher] Stopped");
    }
  }

  /**
   * 轮询所有任务的状态
   */
  poll() {
    try {
      for (const [jobId, job] of this.db.jobs) {
        const previousState = this.previousStates.get(jobId);
        const currentState = job.status;

        // 检测状态变化
        if (previousState === undefined || previousState !== currentState) {
          this.previousStates.set(jobId, currentState);

          // 发出事件
          this.emitStatusChangeEvent(jobId, previousState, currentState, job);
        }
      }
    } catch (err) {
      console.error("[JobStatusWatcher] Error during polling:", err);
    }
  }

  /**
   * 发出状态变化事件
   */
  emitStatusChangeEvent(jobId, oldStatus, newStatus, job) {
    const eventData = {
      jobId,
      oldStatus: oldStatus || "unknown",
      newStatus,
      timestamp: new Date().toISOString(),
      resultCount: job.result_count || 0,
      job: {
        id: job.id,
        seed: job.seed,
        status: job.status,
        created_at: job.created_at,
        finished_at: job.finished_at,
      },
    };

    // 根据状态变化发出不同的事件
    if (oldStatus === undefined) {
      // 新任务
      this.eventBus.emit("job:created", eventData);
    } else if (oldStatus === "waiting" && newStatus === "running") {
      // 任务开始
      this.eventBus.emit("job:started", eventData);
    } else if (newStatus === "running") {
      // 任务进行中（进度更新）
      this.eventBus.emit("job:progress", eventData);
    } else if (newStatus === "completed") {
      // 任务完成
      this.eventBus.emit("job:completed", eventData);
    } else if (newStatus === "failed") {
      // 任务失败
      this.eventBus.emit("job:failed", eventData);
    }

    // 通用事件
    this.eventBus.emit("job:status_changed", eventData);
  }

  /**
   * 获取特定任务的监控状态
   */
  getJobStatus(jobId) {
    return this.previousStates.get(jobId) || null;
  }

  /**
   * 清空所有记录的状态（用于重置）
   */
  reset() {
    this.previousStates.clear();
  }
}

export default JobStatusWatcher;
//# sourceMappingURL=jobStatusWatcher.js.map
