/**
 * useContentPlan Hook
 * Phase 5-6: Fetch and generate content plans with user editing support
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContentPlanResponse } from "../types/api";

/**
 * Get content plan for a cluster (with polling when status is "generating")
 */
export function useContentPlan(clusterId: string | undefined) {
  return useQuery({
    queryKey: ["content-plan", clusterId],
    queryFn: async () => {
      if (!clusterId) {
        return null;
      }
      const res = await fetch(`/api/clusters/${clusterId}/content-plan`);
      if (!res.ok) {
        throw new Error(`Failed to fetch content plan: ${res.statusText}`);
      }
      return res.json() as Promise<ContentPlanResponse>;
    },
    enabled: !!clusterId,
    refetchInterval: (data) => {
      return data?.status === "generating" ? 3000 : false;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Trigger content generation for a cluster
 */
export function useGenerateContentPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clusterId,
      force,
    }: {
      clusterId: string;
      force?: boolean;
    }) => {
      const url = `/api/clusters/${clusterId}/generate-content${
        force ? "?force=true" : ""
      }`;
      const res = await fetch(url, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Failed to generate content: ${res.statusText}`);
      }
      return res.json() as Promise<ContentPlanResponse>;
    },
    onSuccess: (_, { clusterId }) => {
      queryClient.invalidateQueries({
        queryKey: ["content-plan", clusterId],
      });
    },
  });
}

/**
 * Phase 6: Update user edits and publishing fields for content plan
 */
export function usePatchContentPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clusterId,
      patch,
    }: {
      clusterId: string;
      patch: Partial<{
        brief: any;
        faq: any;
        publishedUrl: string;
        publishedAt: number;
        notes: string;
      }>;
    }) => {
      const res = await fetch(`/api/clusters/${clusterId}/content-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`Failed to update content plan: ${res.statusText}`);
      }
      return res.json() as Promise<ContentPlanResponse>;
    },
    onSuccess: (_, { clusterId }) => {
      queryClient.invalidateQueries({
        queryKey: ["content-plan", clusterId],
      });
    },
  });
}
