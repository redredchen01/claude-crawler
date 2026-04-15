/**
 * Content Planning Page
 * Phase 3.3: Main interface for cluster visualization, planning, and content generation
 */

import React, { useState, useEffect } from "react";
import ClusterList from "../components/ClusterList";
import ClusterDetailView from "../components/ClusterDetailView";
import ClusterVisualization from "../components/ClusterVisualization";
import { useContentPlan, useGenerateContentPlan } from "../hooks/useContentPlan";
import type {
  Cluster,
  KeywordFeature,
  ContentBrief,
  FAQPage,
  InternalLinkSuggestions,
} from "../types/api";

interface ContentPlan {
  brief: ContentBrief | null;
  faq: FAQPage | null;
  links: InternalLinkSuggestions | null;
}

export const ContentPlanningPage: React.FC = () => {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    null,
  );
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterKeywords, setClusterKeywords] = useState<
    Map<string, KeywordFeature[]>
  >(new Map());
  // contentPlans now managed by useContentPlan hook
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "visualization" | "detail">(
    "list",
  );
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>("");

  // Load clusters when component mounts
  useEffect(() => {
    loadClusters();
  }, [projectId]);

  const loadClusters = async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clusters?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to load clusters");

      const data = await response.json();
      setClusters(data.clusters || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clusters");
    } finally {
      setIsLoading(false);
    }
  };

  const loadClusterDetails = async (clusterId: string) => {
    try {
      const keywordRes = await fetch(`/api/clusters/${clusterId}/keywords`);
      if (keywordRes.ok) {
        const keywordData = await keywordRes.json();
        setClusterKeywords((prev) =>
          new Map(prev).set(clusterId, keywordData.keywords || []),
        );
      }
      // Content plan now loaded by useContentPlan hook
    } catch (err) {
      console.error("Failed to load cluster details:", err);
    }
  };

  const handleSelectCluster = (cluster: Cluster) => {
    setSelectedClusterId(cluster.id);
    setViewMode("detail");
    loadClusterDetails(cluster.id);
  };

  // handleGenerateContent now handled by useGenerateContentPlan hook in ClusterDetailView

  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);
  const selectedKeywords = clusterKeywords.get(selectedClusterId || "") || [];
  // selectedPlan now managed by ClusterDetailView using useContentPlan hook

  return (
    <div className="content-planning-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-title">
          <h1>Content Planning</h1>
          <p className="subtitle">
            Manage keyword clusters, visualize relationships, and generate
            content plans
          </p>
        </div>

        <div className="header-controls">
          <div className="project-selector">
            <label htmlFor="project-select">Project:</label>
            <select
              id="project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input-field"
            >
              <option value="">Select a project</option>
              <option value="project-1">Project Alpha</option>
              <option value="project-2">Project Beta</option>
            </select>
          </div>

          <div className="view-mode-buttons">
            <button
              className={`mode-button ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              📋 List
            </button>
            <button
              className={`mode-button ${viewMode === "visualization" ? "active" : ""}`}
              onClick={() => setViewMode("visualization")}
            >
              🔗 Network
            </button>
            {selectedClusterId && (
              <button
                className={`mode-button ${viewMode === "detail" ? "active" : ""}`}
                onClick={() => setViewMode("detail")}
              >
                📄 Detail
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Error message */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="btn-close">
            ✕
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="page-content">
        {viewMode === "list" && (
          <ClusterList
            clusters={clusters}
            onSelectCluster={handleSelectCluster}
            isLoading={isLoading}
            onGenerateContent={handleGenerateContent}
          />
        )}

        {viewMode === "visualization" && (
          <div className="visualization-container">
            <ClusterVisualization
              clusters={clusters}
              selectedClusterId={selectedClusterId}
              onSelectCluster={(id) => {
                setSelectedClusterId(id);
                setViewMode("detail");
                loadClusterDetails(id);
              }}
              height={600}
            />
          </div>
        )}

        {viewMode === "detail" && selectedCluster && (
          <div className="detail-container">
            <button
              className="btn btn-secondary btn-back"
              onClick={() => setViewMode("list")}
            >
              ← Back to List
            </button>

            <ClusterDetailView
              clusterId={selectedCluster.id}
              cluster={selectedCluster}
              contentPlan={selectedPlan}
              keywords={selectedKeywords}
              onGenerateContent={handleGenerateContent}
              isLoading={isLoading}
            />
          </div>
        )}

        {!projectId && (
          <div className="empty-state">
            <h2>Select a Project</h2>
            <p>Choose a project from the selector above to get started</p>
          </div>
        )}

        {projectId && clusters.length === 0 && !isLoading && (
          <div className="empty-state">
            <h2>No Clusters Yet</h2>
            <p>
              Create a keyword job to generate clusters. Click the "New Job"
              button to get started.
            </p>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <footer className="page-footer">
        <div className="footer-stats">
          <div className="stat">
            <span className="label">Total Clusters:</span>
            <span className="value">{clusters.length}</span>
          </div>
          <div className="stat">
            <span className="label">Total Keywords:</span>
            <span className="value">
              {clusters.reduce((sum, c) => sum + c.memberCount, 0)}
            </span>
          </div>
          <div className="stat">
            <span className="label">Plans Generated:</span>
            <span className="value">{contentPlans.size}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ContentPlanningPage;
