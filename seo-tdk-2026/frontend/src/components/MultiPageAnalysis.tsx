/**
 * MultiPageAnalysis Component
 *
 * Analyzes TDK recommendations across multiple content plan clusters
 * Features:
 * - Cross-page keyword conflict detection
 * - Topic coherence measurement
 * - TDK status summary
 * - Recommendations for conflict resolution
 */

import React, { useState, useEffect } from "react";
import { useTdkStore } from "../hooks/useTdkStore";
import "./MultiPageAnalysis.css";

/**
 * Props for MultiPageAnalysis component
 */
export interface MultiPageAnalysisProps {
  projectId: string;
  clusterIds: string[];
  language?: "en" | "zh";
  onAnalysisComplete?: (result: AnalysisResult) => void;
}

/**
 * Analysis result from API
 */
export interface AnalysisResult {
  projectId: string;
  analysisTime: string;
  language: "en" | "zh";
  clustersAnalyzed: number;
  conflictCount: number;
  conflicts: {
    total: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    details: Array<{
      cluster1: string;
      cluster2: string;
      conflictingKeywords: string[];
      similarity: number;
      severity: "high" | "medium" | "low";
    }>;
  };
  topicCoherence: number;
  recommendation: string;
}

/**
 * TDK Summary for a cluster
 */
export interface TdkSummaryItem {
  clusterId: string;
  title: string;
  hasGenerated: boolean;
  generationCount: number;
  generatedAt?: string;
  language?: "en" | "zh";
  keywords: string[];
  keywordCount: number;
}

/**
 * TDK Summary response
 */
export interface TdkSummaryResponse {
  projectId: string;
  totalClusters: number;
  clustersWithTdk: number;
  clusters: TdkSummaryItem[];
}

/**
 * Severity badge component
 */
function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const colors = {
    high: "#d32f2f",
    medium: "#f57c00",
    low: "#fbc02d",
  };
  const labels = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return (
    <span
      className="severity-badge"
      style={{ backgroundColor: colors[severity], color: "white" }}
    >
      {labels[severity]}
    </span>
  );
}

/**
 * Conflict card component
 */
function ConflictCard({
  conflict,
}: {
  conflict: {
    cluster1: string;
    cluster2: string;
    conflictingKeywords: string[];
    similarity: number;
    severity: "high" | "medium" | "low";
  };
}) {
  return (
    <div className="conflict-card">
      <div className="conflict-header">
        <div className="conflict-pair">
          <span className="cluster-name">{conflict.cluster1}</span>
          <span className="conflict-arrow">↔</span>
          <span className="cluster-name">{conflict.cluster2}</span>
        </div>
        <SeverityBadge severity={conflict.severity} />
      </div>

      <div className="conflict-keywords">
        <strong>Conflicting Keywords:</strong>
        <div className="keyword-list">
          {conflict.conflictingKeywords.map((kw, idx) => (
            <span key={idx} className="keyword-tag">
              {kw}
            </span>
          ))}
        </div>
      </div>

      <div className="conflict-similarity">
        Similarity Score: {(conflict.similarity * 100).toFixed(1)}%
      </div>
    </div>
  );
}

/**
 * Status summary card
 */
function StatusSummary({ summary }: { summary: TdkSummaryResponse }) {
  const coverage = summary.totalClusters
    ? ((summary.clustersWithTdk / summary.totalClusters) * 100).toFixed(1)
    : "0";

  return (
    <div className="status-summary">
      <h3>TDK Generation Status</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">Total Clusters</span>
          <span className="summary-value">{summary.totalClusters}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">With TDK</span>
          <span className="summary-value">{summary.clustersWithTdk}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Coverage</span>
          <span className="summary-value">{coverage}%</span>
        </div>
      </div>

      <div className="cluster-list">
        <h4>Cluster Details</h4>
        {summary.clusters.map((cluster) => (
          <div key={cluster.clusterId} className="cluster-item">
            <div className="cluster-title">{cluster.title}</div>
            <div className="cluster-meta">
              <span className="status-label">
                {cluster.hasGenerated ? "✓ Generated" : "○ Pending"}
              </span>
              {cluster.generationCount > 0 && (
                <span className="generation-count">
                  Gen: {cluster.generationCount}
                </span>
              )}
              {cluster.keywords.length > 0 && (
                <span className="keyword-count">
                  Keywords: {cluster.keywordCount}
                </span>
              )}
            </div>
            {cluster.keywords.length > 0 && (
              <div className="cluster-keywords">
                {cluster.keywords.map((kw, idx) => (
                  <span key={idx} className="keyword-tag">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Main MultiPageAnalysis component
 */
export const MultiPageAnalysis: React.FC<MultiPageAnalysisProps> = ({
  projectId,
  clusterIds,
  language = "en",
  onAnalysisComplete,
}) => {
  const store = useTdkStore();
  const [summary, setSummary] = useState<TdkSummaryResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "conflicts">(
    "summary",
  );

  const userId =
    typeof window !== "undefined"
      ? localStorage.getItem("userId") || "guest"
      : "guest";

  // Load TDK summary on mount
  useEffect(() => {
    const loadSummary = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/projects/${projectId}/tdk-summary`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "Failed to load summary");
        }

        const data = await response.json();
        setSummary(data.data);

        // Store in Zustand
        if (data.data) {
          store.setMultiPageStats({
            totalPages: data.data.totalClusters,
            pagesWithTdk: data.data.clustersWithTdk,
            averageScore: 0, // Will be calculated from conflicts
            conflictCount: 0, // Will be updated from conflict analysis
          });
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadSummary();
  }, [projectId, userId, store]);

  // Run conflict analysis
  const runConflictAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const clusterParam = clusterIds.join(",");
      const response = await fetch(
        `/api/projects/${projectId}/conflict-report?language=${language}&clusterIds=${clusterParam}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to run analysis");
      }

      const data = await response.json();
      setAnalysis(data.data);

      // Update Zustand store
      store.setMultiPageStats({
        totalPages: data.data.clustersAnalyzed,
        pagesWithTdk: data.data.clustersAnalyzed,
        averageScore: data.data.topicCoherence,
        conflictCount: data.data.conflictCount,
      });

      // Build conflict matrix
      const matrix: Record<string, number> = {};
      data.data.conflicts.details.forEach(
        (conflict: {
          cluster1: string;
          cluster2: string;
          similarity: number;
        }) => {
          const key = [conflict.cluster1, conflict.cluster2].sort().join("|");
          matrix[key] = conflict.similarity;
        },
      );
      store.setConflictMatrix(matrix);

      if (onAnalysisComplete) {
        onAnalysisComplete(data.data);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="multi-page-analysis">
      <div className="analysis-header">
        <h2>Multi-Page Analysis</h2>
        <button
          className="btn-analyze"
          onClick={runConflictAnalysis}
          disabled={isLoading || clusterIds.length < 2}
        >
          {isLoading ? "Analyzing..." : "Run Conflict Analysis"}
        </button>
      </div>

      {error && <div className="error-message">Error: {error}</div>}

      <div className="analysis-tabs">
        <button
          className={`tab-button ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
        <button
          className={`tab-button ${activeTab === "conflicts" ? "active" : ""}`}
          onClick={() => setActiveTab("conflicts")}
          disabled={!analysis}
        >
          Conflicts ({analysis?.conflictCount || 0})
        </button>
      </div>

      {activeTab === "summary" && summary && (
        <StatusSummary summary={summary} />
      )}

      {activeTab === "conflicts" && analysis && (
        <div className="conflict-analysis">
          <div className="conflict-header-section">
            <h3>Conflict Detection Results</h3>
            <div className="coherence-score">
              <span>
                Topic Coherence: {(analysis.topicCoherence * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="conflict-summary">
            <div className="summary-box high">
              <span className="count">{analysis.conflicts.highSeverity}</span>
              <span className="label">High Severity</span>
            </div>
            <div className="summary-box medium">
              <span className="count">{analysis.conflicts.mediumSeverity}</span>
              <span className="label">Medium Severity</span>
            </div>
            <div className="summary-box low">
              <span className="count">{analysis.conflicts.lowSeverity}</span>
              <span className="label">Low Severity</span>
            </div>
          </div>

          {analysis.recommendation && (
            <div className="recommendation-box">
              <strong>Recommendation:</strong>
              <p>{analysis.recommendation}</p>
            </div>
          )}

          <div className="conflicts-grid">
            {analysis.conflicts.details.map((conflict, idx) => (
              <ConflictCard key={idx} conflict={conflict} />
            ))}
          </div>

          {analysis.conflicts.details.length === 0 && (
            <div className="no-conflicts">
              ✓ No conflicts detected! Your TDK recommendations are
              well-aligned.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiPageAnalysis;
