/**
 * useJobs Hook
 * Manages job listing and creation with react-query
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export interface Job {
  jobId: string;
  projectId: string;
  status: "pending" | "processing" | "completed" | "failed";
  seedKeywords: string[];
  totalCandidates: number;
  processedCount: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * useJob: Fetch single job with polling when processing
 */
export function useJob(projectId: string, jobId: string) {
  return useQuery({
    queryKey: ["job", projectId, jobId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/jobs/${jobId}`);
      return res.json() as Promise<Job>;
    },
    refetchInterval: (data) => {
      if (!data) return false;
      // Poll every 2 seconds if processing or pending
      if (data.status === "pending" || data.status === "processing") {
        return 2000;
      }
      return false;
    },
  });
}

/**
 * useJobs: Fetch list of jobs for a project
 */
export function useJobs(projectId: string) {
  return useQuery({
    queryKey: ["jobs", projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/jobs`);
      return res.json() as Promise<Job[]>;
    },
  });
}

/**
 * useCreateJob: Create a single job
 */
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      seedKeywords,
      config,
    }: {
      projectId: string;
      seedKeywords: string[];
      config?: Record<string, any>;
    }) => {
      const res = await api.post(
        `/projects/${projectId}/jobs`,
        {
          seedKeywords,
          config,
        }
      );
      return res.json() as Promise<Job>;
    },
    onSuccess: (data) => {
      // Invalidate jobs list for this project
      queryClient.invalidateQueries({
        queryKey: ["jobs", data.projectId],
      });
    },
  });
}

/**
 * useCreateBatchJobs: Create multiple jobs in one request
 */
export function useCreateBatchJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      jobs,
    }: {
      projectId: string;
      jobs: Array<{
        seedKeywords: string[];
        config?: Record<string, any>;
      }>;
    }) => {
      const res = await api.post(
        `/projects/${projectId}/jobs/batch`,
        { jobs }
      );
      return res.json() as Promise<{ jobIds: string[]; queued: number }>;
    },
    onSuccess: (data, variables) => {
      // Invalidate jobs list for this project
      queryClient.invalidateQueries({
        queryKey: ["jobs", variables.projectId],
      });
    },
  });
}
