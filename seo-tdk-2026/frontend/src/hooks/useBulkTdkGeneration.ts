/**
 * useBulkTdkGeneration Hook
 *
 * Manages sequential batch TDK generation for multiple content plans
 * Process runs sequentially to control API cost and avoid rate limits
 */

import { useState, useCallback } from "react";

export interface BulkGenerationState {
  isRunning: boolean;
  total: number;
  completed: number;
  succeeded: string[];
  failed: string[];
  currentClusterId: string | null;
  error: string | null;
}

export interface BulkGenerationActions {
  startBatch: (clusterIds: string[], projectId: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export interface UseBulkTdkGenerationReturn
  extends BulkGenerationState,
    BulkGenerationActions {
  progress: number; // 0-100
}

export function useBulkTdkGeneration(
  userId: string = typeof window !== "undefined"
    ? localStorage.getItem("userId") || "guest"
    : "guest",
): UseBulkTdkGenerationReturn {
  const [state, setState] = useState<BulkGenerationState>({
    isRunning: false,
    total: 0,
    completed: 0,
    succeeded: [],
    failed: [],
    currentClusterId: null,
    error: null,
  });

  const [isCancelled, setIsCancelled] = useState(false);

  const startBatch = useCallback(
    async (clusterIds: string[], projectId: string) => {
      if (clusterIds.length === 0) {
        setState((prev) => ({
          ...prev,
          error: "No cluster IDs provided",
        }));
        return;
      }

      setState({
        isRunning: true,
        total: clusterIds.length,
        completed: 0,
        succeeded: [],
        failed: [],
        currentClusterId: null,
        error: null,
      });

      setIsCancelled(false);
      let succeeded: string[] = [];
      let failed: string[] = [];

      // Sequential processing
      for (let i = 0; i < clusterIds.length; i++) {
        const clusterId = clusterIds[i];

        if (isCancelled) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: "Batch processing cancelled by user",
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          currentClusterId: clusterId,
        }));

        try {
          // Call the TDK optimize endpoint
          const response = await fetch(
            `/api/projects/${projectId}/clusters/${clusterId}/tdk-optimize`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-user-id": userId,
              },
              body: JSON.stringify({
                topic: `Content for ${clusterId}`,
                keywords: [],
                language: "en",
              }),
            },
          );

          if (response.ok) {
            succeeded.push(clusterId);
          } else {
            failed.push(clusterId);
          }
        } catch (error) {
          failed.push(clusterId);
        }

        // Update progress
        setState((prev) => ({
          ...prev,
          completed: i + 1,
          succeeded,
          failed,
        }));

        // Add small delay between requests to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setState((prev) => ({
        ...prev,
        isRunning: false,
        currentClusterId: null,
      }));
    },
    [userId, isCancelled],
  );

  const cancel = useCallback(() => {
    setIsCancelled(true);
  }, []);

  const reset = useCallback(() => {
    setState({
      isRunning: false,
      total: 0,
      completed: 0,
      succeeded: [],
      failed: [],
      currentClusterId: null,
      error: null,
    });
    setIsCancelled(false);
  }, []);

  const progress =
    state.total === 0 ? 0 : Math.round((state.completed / state.total) * 100);

  return {
    ...state,
    progress,
    startBatch,
    cancel,
    reset,
  };
}
