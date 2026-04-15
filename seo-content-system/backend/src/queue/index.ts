import PQueue from "p-queue";

const QUEUE_CONFIG = {
  concurrency: 4,
  timeout: 30 * 1000, // 30 seconds
  interval: 1000,
  intervalCap: 10,
};

export const queue = new PQueue(QUEUE_CONFIG);

// Track queue metrics
export const queueMetrics = {
  totalJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
};

// Health check
export function getQueueHealth() {
  return {
    isPaused: queue.isPaused,
    size: queue.size,
    pending: queue.pending,
    metrics: queueMetrics,
  };
}

// Monitor queue depth and warn if too deep
queue.on("add", () => {
  queueMetrics.totalJobs++;
  if (queue.size > 100) {
    console.warn(`[Queue] Queue depth: ${queue.size} jobs pending`);
  }
});

queue.on("completed", () => {
  queueMetrics.completedJobs++;
});

queue.on("error", (error) => {
  queueMetrics.failedJobs++;
  console.error("[Queue Error]", error);
});
