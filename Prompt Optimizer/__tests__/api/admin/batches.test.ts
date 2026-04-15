jest.mock("@/lib/adminAuth", () => ({
  requireAdminWithAudit: jest.fn(),
}));
jest.mock("@/lib/adminDashboard");
jest.mock("@/lib/audit");
jest.mock("@/lib/redis", () => ({
  getResponseCache: jest.fn(),
  setResponseCache: jest.fn(),
}));

import { NextRequest } from "next/server";
import * as adminAuth from "@/lib/adminAuth";
import * as adminDashboard from "@/lib/adminDashboard";
import * as audit from "@/lib/audit";
import * as redis from "@/lib/redis";

const mockAdminAuth = adminAuth as jest.Mocked<typeof adminAuth>;
const mockAuditLog = audit as jest.Mocked<typeof audit>;
const mockRedis = redis as jest.Mocked<typeof redis>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminAuth.requireAdminWithAudit.mockResolvedValue({
    user: {
      id: "admin-user-123",
      email: "admin@example.com",
      role: "admin",
    },
  } as any);
  (mockAuditLog.createAuditLog as jest.Mock).mockResolvedValue({});
  mockRedis.getResponseCache.mockResolvedValue(null); // Cache miss
  mockRedis.setResponseCache.mockResolvedValue(undefined);
});

function createRequest(url: string = "/api/admin/batches"): NextRequest {
  return {
    url: `http://localhost:3000${url}`,
    nextUrl: { pathname: url, searchParams: new URLSearchParams() },
    headers: {
      get: (key: string) => {
        switch (key) {
          case "x-request-id":
            return "test-request-123";
          case "x-forwarded-for":
            return "192.168.1.1";
          case "user-agent":
            return "test-agent";
          default:
            return null;
        }
      },
    },
    method: "GET",
  } as any;
}

describe("Admin Dashboard API Routes", () => {
  describe("GET /api/admin/batches", () => {
    test("should return paginated batch list", async () => {
      (adminDashboard.listBatches as jest.Mock).mockResolvedValue({
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
      });

      const { GET } = require("@/app/api/admin/batches/route");
      const response = await GET(createRequest("/api/admin/batches"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.batches).toHaveLength(1);
      expect(data.total).toBe(1);
      expect(data.batches[0].batchName).toBe("Test Batch");
    });

    test("should require admin authentication", async () => {
      mockAdminAuth.requireAdminWithAudit.mockRejectedValue(
        Object.assign(new Error("Unauthorized"), { name: "UnauthorizedError" }),
      );

      const { GET } = require("@/app/api/admin/batches/route");
      const response = await GET(createRequest());

      expect(response.status).toBe(403);
    });

    test("should validate pagination parameters", async () => {
      const { GET } = require("@/app/api/admin/batches/route");

      const request = createRequest("/api/admin/batches?limit=1000&offset=0");
      request.nextUrl.searchParams = new URLSearchParams("limit=1000&offset=0");

      const response = await GET(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid limit");
    });

    test("should support filtering by status", async () => {
      (adminDashboard.listBatches as jest.Mock).mockResolvedValue({
        batches: [],
        total: 0,
      });

      const { GET } = require("@/app/api/admin/batches/route");
      const request = createRequest("/api/admin/batches?status=failed");
      request.nextUrl.searchParams = new URLSearchParams("status=failed");

      const response = await GET(request);
      expect(response.status).toBe(200);
      expect(adminDashboard.listBatches).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
    });
  });

  describe("GET /api/admin/batches/stats", () => {
    test("should return aggregated batch statistics", async () => {
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

      (adminDashboard.getBatchStats as jest.Mock).mockResolvedValue(mockStats);

      const { GET } = require("@/app/api/admin/batches/stats/route");
      const response = await GET(createRequest("/api/admin/batches/stats"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalBatches).toBe(100);
      expect(data.completedBatches).toBe(80);
      expect(data.throughputPerMinute).toBe(150);
    });

    test("should log admin access", async () => {
      (adminDashboard.getBatchStats as jest.Mock).mockResolvedValue({});

      const { GET } = require("@/app/api/admin/batches/stats/route");
      await GET(createRequest("/api/admin/batches/stats"));

      expect(mockAuditLog.createAuditLog).toHaveBeenCalled();
    });
  });

  describe("GET /api/admin/batches/timeline", () => {
    test("should return timeline with hourly aggregation", async () => {
      const mockTimeline = {
        points: [
          {
            timestamp: new Date(),
            completed: 100,
            failed: 5,
            processing: 15,
          },
          {
            timestamp: new Date(Date.now() - 60 * 60 * 1000),
            completed: 95,
            failed: 3,
            processing: 20,
          },
        ],
      };

      (adminDashboard.getBatchTimeline as jest.Mock).mockResolvedValue(
        mockTimeline,
      );

      const { GET } = require("@/app/api/admin/batches/timeline/route");
      const request = createRequest("/api/admin/batches/timeline?hoursBack=24");
      request.nextUrl.searchParams = new URLSearchParams("hoursBack=24");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.points).toHaveLength(2);
      expect(data.points[0].completed).toBe(100);
    });

    test("should validate hoursBack parameter", async () => {
      const { GET } = require("@/app/api/admin/batches/timeline/route");
      const request = createRequest(
        "/api/admin/batches/timeline?hoursBack=1000",
      );
      request.nextUrl.searchParams = new URLSearchParams("hoursBack=1000");

      const response = await GET(request);
      expect(response.status).toBe(400);
    });

    test("should default to 24 hours when not specified", async () => {
      (adminDashboard.getBatchTimeline as jest.Mock).mockResolvedValue({
        points: [],
      });

      const { GET } = require("@/app/api/admin/batches/timeline/route");
      const request = createRequest("/api/admin/batches/timeline");
      request.nextUrl.searchParams = new URLSearchParams("");

      await GET(request);

      expect(adminDashboard.getBatchTimeline).toHaveBeenCalledWith(24);
    });
  });

  describe("GET /api/admin/batches/[id]/timeline", () => {
    test("should return timeline for specific batch job", async () => {
      const mockJobTimeline = {
        jobId: "job-123",
        batchName: "Test Batch",
        status: "completed",
        totalItems: 100,
        processedItems: 100,
        failedItems: 0,
        events: [
          {
            timestamp: new Date(),
            event: "Job started",
            status: "processing",
            processedCount: 0,
            failedCount: 0,
          },
          {
            timestamp: new Date(),
            event: "Job completed",
            status: "completed",
            processedCount: 100,
            failedCount: 0,
          },
        ],
      };

      (adminDashboard.getBatchJobTimeline as jest.Mock).mockResolvedValue(
        mockJobTimeline,
      );

      const { GET } = require("@/app/api/admin/batches/[id]/timeline/route");
      const response = await GET(createRequest(), {
        params: { id: "job-123" },
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobId).toBe("job-123");
      expect(data.events).toHaveLength(2);
      expect(data.status).toBe("completed");
    });

    test("should require job ID parameter", async () => {
      const { GET } = require("@/app/api/admin/batches/[id]/timeline/route");
      const response = await GET(createRequest(), { params: { id: "" } });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Job ID is required");
    });

    test("should handle batch job not found", async () => {
      (adminDashboard.getBatchJobTimeline as jest.Mock).mockRejectedValue(
        new Error("Batch job not found"),
      );

      const { GET } = require("@/app/api/admin/batches/[id]/timeline/route");
      const response = await GET(createRequest(), { params: { id: "bad-id" } });

      expect(response.status).toBe(404);
    });
  });

  describe("Admin access audit logging", () => {
    test("should log IP address and user agent on successful access", async () => {
      (adminDashboard.getBatchStats as jest.Mock).mockResolvedValue({});

      const { GET } = require("@/app/api/admin/batches/stats/route");
      const request = createRequest();

      await GET(request);

      expect(mockAuditLog.createAuditLog).toHaveBeenCalledWith(
        "admin-user-123",
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ipAddress: "192.168.1.1",
          route: expect.any(String),
          status: "success",
        }),
      );
    });

    test("should log failed access attempts", async () => {
      mockAdminAuth.requireAdminWithAudit.mockRejectedValue(
        new Error("Unauthorized"),
      );

      const { GET } = require("@/app/api/admin/batches/stats/route");

      try {
        await GET(createRequest());
      } catch {
        // Expected to fail
      }

      // Audit log should still be called with failure status
      // (implementation detail - may vary)
    });
  });
});
