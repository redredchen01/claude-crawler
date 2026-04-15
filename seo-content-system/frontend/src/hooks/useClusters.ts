/**
 * useClusters Hook
 * Phase 4.1: Fetch and manage clusters for a project
 */

import { useState, useCallback } from "react";
import type { Cluster, KeywordFeature } from "../types/api";

interface UseClusterReturn {
  clusters: Cluster[];
  selectedCluster: Cluster | null;
  keywords: KeywordFeature[];
  loading: boolean;
  error: string | null;
  fetchClusters: (projectId: string) => Promise<void>;
  selectCluster: (clusterId: string) => Promise<void>;
  generateContent: (clusterId: string) => Promise<void>;
  exportClusters: (jobId: string, format: "csv" | "json") => Promise<void>;
}

export function useClusters(): UseClusterReturn {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [keywords, setKeywords] = useState<KeywordFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clusters?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch clusters");

      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch clusters";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectCluster = useCallback(async (clusterId: string) => {
    setError(null);

    try {
      // Fetch cluster details
      const clusterResponse = await fetch(`/api/clusters/${clusterId}`);
      if (!clusterResponse.ok) throw new Error("Failed to fetch cluster");

      const clusterData = await clusterResponse.json();
      setSelectedCluster(clusterData.cluster);

      // Fetch keywords for this cluster
      const keywordsResponse = await fetch(
        `/api/clusters/${clusterId}/keywords`,
      );
      if (keywordsResponse.ok) {
        const keywordsData = await keywordsResponse.json();
        setKeywords(keywordsData.keywords || []);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to select cluster";
      setError(message);
    }
  }, []);

  const generateContent = useCallback(async (clusterId: string) => {
    setError(null);

    try {
      const response = await fetch(
        `/api/clusters/${clusterId}/generate-content`,
        {
          method: "POST",
        },
      );

      if (!response.ok) throw new Error("Failed to generate content");

      // Success - content generated
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate content";
      setError(message);
      throw err;
    }
  }, []);

  const exportClusters = useCallback(
    async (jobId: string, format: "csv" | "json") => {
      setError(null);

      try {
        const response = await fetch(
          `/api/export/clusters/${jobId}?format=${format}`,
        );

        if (!response.ok) throw new Error("Failed to export clusters");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `clusters_${jobId}.${format === "csv" ? "csv" : "json"}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to export clusters";
        setError(message);
        throw err;
      }
    },
    [],
  );

  return {
    clusters,
    selectedCluster,
    keywords,
    loading,
    error,
    fetchClusters,
    selectCluster,
    generateContent,
    exportClusters,
  };
}
