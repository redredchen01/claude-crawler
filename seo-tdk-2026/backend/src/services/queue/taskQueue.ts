/**
 * Task Queue Service
 *
 * Simple in-memory task queue for batch TDK generation
 * Supports: enqueue, process, status check, cancel
 */

/**
 * Simple UUID v4 generator (no external dependency)
 */
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Individual task in the queue
 */
export interface Task {
  id: string;
  projectId: string;
  type: "generate-tdk";
  clusterIds: string[];
  topic?: string;
  keywords?: string[];
  language?: "en" | "zh";
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  results?: Array<{
    clusterId: string;
    success: boolean;
    tdk?: {
      title: string;
      description: string;
      keywords: string[];
    };
    error?: string;
  }>;
  error?: string;
  progress?: {
    completed: number;
    total: number;
  };
}

/**
 * Task Queue implementation
 */
export class TaskQueue {
  private queue: Task[] = [];
  private taskMap: Map<string, Task> = new Map();
  private isProcessing = false;

  /**
   * Enqueue a new batch task
   */
  enqueueTask(
    projectId: string,
    clusterIds: string[],
    topic?: string,
    keywords?: string[],
    language?: "en" | "zh",
  ): string {
    const task: Task = {
      id: generateId(),
      projectId,
      type: "generate-tdk",
      clusterIds,
      topic,
      keywords,
      language: language || "en",
      status: "pending",
      createdAt: new Date(),
      progress: {
        completed: 0,
        total: clusterIds.length,
      },
    };

    this.queue.push(task);
    this.taskMap.set(task.id, task);

    // Start processing in background (non-blocking)
    setImmediate(() => this.processNext());

    return task.id;
  }

  /**
   * Process next task in queue
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const task = this.queue[0]; // Peek at first task
      task.status = "processing";
      task.startedAt = new Date();

      // Simulate async processing
      // In real implementation, this would call TdkGeneratorService
      await this.simulateProcessing(task);

      task.status = "completed";
      task.completedAt = new Date();
      this.queue.shift(); // Remove from queue

      // Process next task
      setImmediate(() => this.processNext());
    } catch (error) {
      const task = this.queue[0];
      task.status = "failed";
      task.error = error instanceof Error ? error.message : "Unknown error";
      task.completedAt = new Date();
      this.queue.shift();

      // Continue processing remaining tasks
      setImmediate(() => this.processNext());
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Simulate batch processing (will be replaced with real implementation)
   */
  private async simulateProcessing(task: Task): Promise<void> {
    return new Promise((resolve) => {
      // Simulate 100ms per cluster
      const delay = Math.min(task.clusterIds.length * 100, 5000);

      const interval = setInterval(() => {
        if (task.progress) {
          task.progress.completed++;
          if (task.progress.completed >= task.progress.total) {
            clearInterval(interval);

            // Mock results
            task.results = task.clusterIds.map((clusterId) => ({
              clusterId,
              success: true,
              tdk: {
                title: `Generated Title for ${clusterId}`,
                description: `Generated description for ${clusterId}`,
                keywords: task.keywords || [],
              },
            }));

            resolve();
          }
        }
      }, 100);
    });
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): Task | null {
    return this.taskMap.get(taskId) || null;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const taskIndex = this.queue.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return false; // Task not found or already completed
    }

    // Cannot cancel currently processing task
    if (taskIndex === 0 && this.isProcessing) {
      return false;
    }

    const task = this.queue[taskIndex];
    task.status = "failed";
    task.error = "Task cancelled";
    task.completedAt = new Date();

    this.queue.splice(taskIndex, 1);
    return true;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get all tasks (for debugging)
   */
  getAllTasks(): Task[] {
    return Array.from(this.taskMap.values());
  }

  /**
   * Clear completed tasks from map
   */
  clearCompleted(): void {
    for (const [taskId, task] of this.taskMap.entries()) {
      if (task.status === "completed" || task.status === "failed") {
        // Keep for some time for debugging, but in production might clear older ones
        const age = Date.now() - task.createdAt.getTime();
        if (age > 1000 * 60 * 60) {
          // 1 hour
          this.taskMap.delete(taskId);
        }
      }
    }
  }
}

/**
 * Global singleton instance
 */
export const taskQueue = new TaskQueue();
