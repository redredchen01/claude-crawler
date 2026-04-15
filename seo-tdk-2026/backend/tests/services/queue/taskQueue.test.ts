/**
 * Task Queue Tests
 *
 * Test batch processing, status tracking, cancellation
 */

import { TaskQueue } from "../../../src/services/queue/taskQueue";

describe("P4.2: Task Queue System", () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe("enqueueTask", () => {
    it("should enqueue a task and return task ID", async () => {
      const taskId = queue.enqueueTask(
        "project-1",
        ["cluster-1", "cluster-2", "cluster-3"],
        "Python Tutorial",
        ["python", "tutorial"],
      );

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe("string");
      expect(queue.getQueueSize()).toBe(1);
    });

    it("should enqueue multiple tasks in order", async () => {
      const taskId1 = queue.enqueueTask("project-1", ["cluster-1"], "Task 1");
      const taskId2 = queue.enqueueTask("project-1", ["cluster-2"], "Task 2");
      const taskId3 = queue.enqueueTask("project-1", ["cluster-3"], "Task 3");

      expect(taskId1).not.toBe(taskId2);
      expect(taskId2).not.toBe(taskId3);
      expect(queue.getQueueSize()).toBe(3);
    });
  });

  describe("getTaskStatus", () => {
    it("should return null for non-existent task", () => {
      const status = queue.getTaskStatus("non-existent");
      expect(status).toBeNull();
    });

    it("should return task with pending status after enqueue", () => {
      const taskId = queue.enqueueTask("project-1", ["cluster-1"]);
      const task = queue.getTaskStatus(taskId);

      expect(task).not.toBeNull();
      expect(task?.id).toBe(taskId);
      expect(task?.status).toBe("pending");
      expect(task?.clusterIds).toEqual(["cluster-1"]);
    });

    it("should track progress during processing", async () => {
      const taskId = queue.enqueueTask("project-1", ["cluster-1", "cluster-2"]);

      // Wait for processing to start
      await new Promise((resolve) => setTimeout(resolve, 150));

      const task = queue.getTaskStatus(taskId);
      expect(task?.status).toBe("processing");
      expect(task?.progress?.total).toBe(2);
    });

    it("should show completed task with results", async () => {
      const taskId = queue.enqueueTask("project-1", ["cluster-1"]);

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const task = queue.getTaskStatus(taskId);
      expect(task?.status).toBe("completed");
      expect(task?.results).toBeDefined();
      expect(task?.results?.length).toBe(1);
      expect(task?.results?.[0].success).toBe(true);
    });
  });

  describe("cancelTask", () => {
    it("should cancel pending task before processing", async () => {
      const taskId1 = queue.enqueueTask(
        "project-1",
        ["cluster-1"],
        "Long task",
      );
      const taskId2 = queue.enqueueTask(
        "project-1",
        ["cluster-2"],
        "Quick task",
      );

      // Cancel second task while first is processing
      const cancelled = queue.cancelTask(taskId2);
      expect(cancelled).toBe(true);

      const cancelledTask = queue.getTaskStatus(taskId2);
      expect(cancelledTask?.status).toBe("failed");
      expect(cancelledTask?.error).toBe("Task cancelled");
    });

    it("should return false for non-existent task", () => {
      const cancelled = queue.cancelTask("non-existent");
      expect(cancelled).toBe(false);
    });

    it("should not cancel currently processing task", async () => {
      const taskId = queue.enqueueTask("project-1", ["cluster-1"]);

      // Wait for task to start processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      const cancelled = queue.cancelTask(taskId);
      expect(cancelled).toBe(false);
    });
  });

  describe("queue management", () => {
    it("should process tasks sequentially", async () => {
      const startTime = Date.now();
      const taskId1 = queue.enqueueTask("project-1", ["c1"]);
      const taskId2 = queue.enqueueTask("project-1", ["c2"]);

      // Initial queue size
      expect(queue.getQueueSize()).toBe(2);

      // Wait for both to complete
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(queue.getQueueSize()).toBe(0);

      const task1 = queue.getTaskStatus(taskId1);
      const task2 = queue.getTaskStatus(taskId2);

      expect(task1?.status).toBe("completed");
      expect(task2?.status).toBe("completed");
    });

    it("should return all tasks via getAllTasks", () => {
      const taskId1 = queue.enqueueTask("project-1", ["cluster-1"]);
      const taskId2 = queue.enqueueTask("project-1", ["cluster-2"]);

      const allTasks = queue.getAllTasks();
      expect(allTasks.length).toBe(2);
      expect(allTasks[0].id).toBe(taskId1);
      expect(allTasks[1].id).toBe(taskId2);
    });
  });
});
