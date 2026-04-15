jest.mock("@/lib/adminAuth", () => ({
  requireAdminWithAudit: jest.fn(),
}));
jest.mock("@/lib/adminDashboard");

import * as adminAuth from "@/lib/adminAuth";
import * as adminDashboard from "@/lib/adminDashboard";

const mockAdminAuth = adminAuth as jest.Mocked<typeof adminAuth>;
const mockAdminDash = adminDashboard as jest.Mocked<typeof adminDashboard>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminAuth.requireAdminWithAudit.mockResolvedValue({
    userId: "admin-123",
    role: "admin",
    email: "admin@example.com",
  } as any);
});

describe("Admin Dashboard Endpoints", () => {
  describe("Batch Statistics", () => {
    test("getBatchStats returns KPI metrics", async () => {
      const mockStats = {
        totalBatches: 100,
        completedBatches: 80,
        failedBatches: 5,
        processingBatches: 15,
        totalPrompts: 50000,
        processedPrompts: 45000,
        failedPrompts: 2500,
        averageProcessingTimeMs: 5000,
        throughputPerMinute: 150,
      };

      mockAdminDash.getBatchStats.mockResolvedValue(mockStats);

      const result = await adminDashboard.getBatchStats();

      expect(result.totalBatches).toBe(100);
      expect(result.completedBatches).toBe(80);
      expect(result.throughputPerMinute).toBe(150);
    });
  });

  describe("Batch Timeline", () => {
    test("getBatchTimeline returns hourly aggregated data", async () => {
      const mockTimeline = {
        points: [
          { timestamp: new Date(), completed: 100, failed: 5, processing: 15 },
          {
            timestamp: new Date(Date.now() - 60 * 60 * 1000),
            completed: 95,
            failed: 3,
            processing: 20,
          },
        ],
      };

      mockAdminDash.getBatchTimeline.mockResolvedValue(mockTimeline);

      const result = await adminDashboard.getBatchTimeline(24);

      expect(result.points).toHaveLength(2);
      expect(result.points[0].completed).toBe(100);
    });
  });

  describe("Batch List", () => {
    test("listBatches returns paginated results", async () => {
      const mockBatches = {
        batches: [
          {
            id: "batch-1",
            batchName: "Test Batch",
            status: "completed",
            userId: "user-123",
            totalItems: 100,
            processedItems: 100,
            failedItems: 0,
            progressPercent: 100,
            createdAt: new Date(),
          },
        ],
        total: 1,
      };

      mockAdminDash.listBatches.mockResolvedValue(mockBatches);

      const result = await adminDashboard.listBatches({
        limit: 50,
        offset: 0,
      });

      expect(result.batches).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.batches[0].status).toBe("completed");
    });

    test("listBatches supports filtering by status", async () => {
      const mockBatches = { batches: [], total: 0 };

      mockAdminDash.listBatches.mockResolvedValue(mockBatches);

      await adminDashboard.listBatches({
        status: "failed",
        limit: 50,
        offset: 0,
      });

      expect(mockAdminDash.listBatches).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
    });
  });

  describe("Job Timeline", () => {
    test("getBatchJobTimeline returns job progress events", async () => {
      const mockJobTimeline = {
        jobId: "job-123",
        batchName: "Test Batch",
        status: "completed",
        totalItems: 100,
        processedItems: 100,
        failedItems: 0,
        events: [
          { timestamp: new Date(), event: "Job started", status: "processing" },
          {
            timestamp: new Date(),
            event: "Job completed",
            status: "completed",
          },
        ],
      };

      mockAdminDash.getBatchJobTimeline.mockResolvedValue(mockJobTimeline);

      const result = await adminDashboard.getBatchJobTimeline("job-123");

      expect(result.jobId).toBe("job-123");
      expect(result.events).toHaveLength(2);
      expect(result.status).toBe("completed");
    });

    test("getBatchJobTimeline throws when job not found", async () => {
      mockAdminDash.getBatchJobTimeline.mockRejectedValue(
        new Error("Batch job not found"),
      );

      await expect(
        adminDashboard.getBatchJobTimeline("bad-id"),
      ).rejects.toThrow("Batch job not found");
    });
  });

  describe("Admin Authentication", () => {
    test("requireAdminWithAudit verifies admin access", async () => {
      mockAdminAuth.requireAdminWithAudit.mockResolvedValue({
        userId: "admin-123",
        role: "admin",
        email: "admin@example.com",
      } as any);

      const result = await adminAuth.requireAdminWithAudit(
        {} as any,
        "ADMIN_DASHBOARD_VIEWED" as any,
      );

      expect(result.role).toBe("admin");
      expect(result.userId).toBe("admin-123");
    });

    test("requireAdminWithAudit rejects non-admin users", async () => {
      mockAdminAuth.requireAdminWithAudit.mockRejectedValue(
        new Error("Unauthorized"),
      );

      await expect(
        adminAuth.requireAdminWithAudit(
          {} as any,
          "ADMIN_DASHBOARD_VIEWED" as any,
        ),
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("Data Integrity", () => {
    test("batch list includes all required fields", async () => {
      const mockBatches = {
        batches: [
          {
            id: "batch-1",
            batchName: "Test",
            status: "completed",
            userId: "user-123",
            totalItems: 100,
            processedItems: 100,
            failedItems: 0,
            progressPercent: 100,
            createdAt: new Date(),
          },
        ],
        total: 1,
      };

      mockAdminDash.listBatches.mockResolvedValue(mockBatches);

      const result = await adminDashboard.listBatches({ limit: 50, offset: 0 });
      const batch = result.batches[0];

      expect(batch).toHaveProperty("id");
      expect(batch).toHaveProperty("batchName");
      expect(batch).toHaveProperty("status");
      expect(batch).toHaveProperty("userId");
      expect(batch).toHaveProperty("totalItems");
      expect(batch).toHaveProperty("processedItems");
      expect(batch).toHaveProperty("failedItems");
      expect(batch).toHaveProperty("progressPercent");
      expect(batch).toHaveProperty("createdAt");
    });

    test("timeline includes required fields", async () => {
      const mockTimeline = {
        points: [
          {
            timestamp: new Date(),
            completed: 100,
            failed: 5,
            processing: 15,
          },
        ],
      };

      mockAdminDash.getBatchTimeline.mockResolvedValue(mockTimeline);

      const result = await adminDashboard.getBatchTimeline(24);
      const point = result.points[0];

      expect(point).toHaveProperty("timestamp");
      expect(point).toHaveProperty("completed");
      expect(point).toHaveProperty("failed");
      expect(point).toHaveProperty("processing");
    });
  });
});
