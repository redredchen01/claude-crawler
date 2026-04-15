/**
 * useBulkTdkGeneration Hook Tests
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useBulkTdkGeneration } from "../../src/hooks/useBulkTdkGeneration";

// Mock fetch
global.fetch = jest.fn();

describe("useBulkTdkGeneration Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      expect(result.current.isRunning).toBe(false);
      expect(result.current.total).toBe(0);
      expect(result.current.completed).toBe(0);
      expect(result.current.currentClusterId).toBeNull();
      expect(result.current.succeeded).toEqual([]);
      expect(result.current.failed).toEqual([]);
    });
  });

  describe("Batch generation", () => {
    it("should process clusters sequentially", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());
      const clusterIds = ["cluster-1", "cluster-2"];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", clusterIds);
      });

      await waitFor(() => {
        expect(result.current.completed).toBe(2);
      });

      expect(result.current.succeeded.length).toBe(2);
      expect(result.current.failed.length).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    it("should handle generation success", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());
      const clusterIds = ["cluster-1"];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", clusterIds);
      });

      await waitFor(() => {
        expect(result.current.succeeded.length).toBe(1);
      });

      expect(result.current.succeeded[0]).toMatchObject({
        clusterId: "cluster-1",
        success: true,
      });
      expect(result.current.succeeded[0].generatedAt).toBeDefined();
    });

    it("should handle generation failure", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());
      const clusterIds = ["cluster-1"];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { message: "API error" },
        }),
      });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", clusterIds);
      });

      await waitFor(() => {
        expect(result.current.failed.length).toBe(1);
      });

      expect(result.current.failed[0]).toMatchObject({
        clusterId: "cluster-1",
        success: false,
        error: "API error",
      });
    });

    it("should track progress correctly", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());
      const clusterIds = ["cluster-1", "cluster-2", "cluster-3"];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      await act(async () => {
        const promise = result.current.startBatchGeneration(
          "project-1",
          clusterIds,
        );

        // Check initial state
        expect(result.current.total).toBe(3);
        expect(result.current.completed).toBe(0);
        expect(result.current.isRunning).toBe(true);

        await promise;
      });

      expect(result.current.completed).toBe(3);
      expect(result.current.isRunning).toBe(false);
    });

    it("should support topic overrides", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      const overrides = {
        "cluster-1": "Custom Topic 1",
        "cluster-2": "Custom Topic 2",
      };

      await act(async () => {
        await result.current.startBatchGeneration(
          "project-1",
          ["cluster-1", "cluster-2"],
          overrides,
        );
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("cluster-1"),
        expect.objectContaining({
          body: expect.stringContaining("Custom Topic 1"),
        }),
      );
    });

    it("should use default topic if override not provided", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", ["cluster-1"]);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("cluster-1"),
        expect.objectContaining({
          body: expect.stringContaining("Content for cluster-1"),
        }),
      );
    });
  });

  describe("Batch cancellation", () => {
    it("should stop processing on cancel", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: { primary: {} } }),
                }),
              1000,
            ),
          ),
      );

      const promise = act(async () => {
        await result.current.startBatchGeneration("project-1", [
          "cluster-1",
          "cluster-2",
        ]);
      });

      // Cancel after a short delay
      setTimeout(() => {
        act(() => {
          result.current.cancelBatch();
        });
      }, 100);

      await promise;

      expect(result.current.isRunning).toBe(false);
    });
  });

  describe("Reset functionality", () => {
    it("should reset state after batch completes", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { primary: {} } }),
      });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", ["cluster-1"]);
      });

      expect(result.current.succeeded.length).toBe(1);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.total).toBe(0);
      expect(result.current.completed).toBe(0);
      expect(result.current.succeeded).toEqual([]);
      expect(result.current.failed).toEqual([]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty cluster list", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      await act(async () => {
        await result.current.startBatchGeneration("project-1", []);
      });

      expect(result.current.total).toBe(0);
      expect(result.current.completed).toBe(0);
      expect(result.current.isRunning).toBe(false);
    });

    it("should handle mixed success and failure", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { primary: {} } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { message: "Error" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { primary: {} } }),
        });

      await act(async () => {
        await result.current.startBatchGeneration("project-1", [
          "cluster-1",
          "cluster-2",
          "cluster-3",
        ]);
      });

      expect(result.current.succeeded.length).toBe(2);
      expect(result.current.failed.length).toBe(1);
      expect(result.current.completed).toBe(3);
    });

    it("should handle network errors gracefully", async () => {
      const { result } = renderHook(() => useBulkTdkGeneration());

      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      await act(async () => {
        await result.current.startBatchGeneration("project-1", ["cluster-1"]);
      });

      expect(result.current.failed.length).toBe(1);
      expect(result.current.failed[0].error).toContain("Network error");
    });
  });
});
