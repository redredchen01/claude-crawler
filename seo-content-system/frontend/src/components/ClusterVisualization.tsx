/**
 * Cluster Visualization Component
 * Phase 3.3: Visual representation of cluster relationships and network
 */

import React, { useMemo } from "react";
import type { Cluster } from "../types/api";

interface ClusterVisualizationProps {
  clusters: Cluster[];
  selectedClusterId?: string;
  onSelectCluster?: (clusterId: string) => void;
  height?: number;
}

interface LayoutCluster extends Cluster {
  x: number;
  y: number;
  radius: number;
}

export const ClusterVisualization: React.FC<ClusterVisualizationProps> = ({
  clusters,
  selectedClusterId,
  onSelectCluster,
  height = 500,
}) => {
  const svgRef = React.useRef<SVGSVGElement>(null);

  // Calculate layout using simple force-directed approach
  const layoutClusters = useMemo(() => {
    if (clusters.length === 0) return [];

    const width = 800;
    const centerX = width / 2;
    const centerY = height / 2;

    // Position clusters in a circle based on priority
    const sorted = [...clusters].sort((a, b) => b.priority - a.priority);

    return sorted.map((cluster, index) => {
      const angle = (index / clusters.length) * Math.PI * 2;
      const distance = Math.min(width, height) / 3;

      return {
        ...cluster,
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        radius: Math.max(20, Math.min(60, cluster.priority * 80 + 20)),
      };
    });
  }, [clusters, height]);

  // Find related clusters for connections
  const connections = useMemo(() => {
    const edges: Array<[number, number, number]> = [];

    layoutClusters.forEach((cluster1, i) => {
      layoutClusters.forEach((cluster2, j) => {
        if (i >= j) return;

        // Calculate similarity based on keyword overlap
        const keywords1 = new Set(
          cluster1.keywords.map((k) => k.toLowerCase()),
        );
        const keywords2 = new Set(
          cluster2.keywords.map((k) => k.toLowerCase()),
        );

        const intersection = [...keywords1].filter((k) =>
          keywords2.has(k),
        ).length;
        const union = new Set([...keywords1, ...keywords2]).size;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard > 0.1) {
          edges.push([i, j, jaccard]);
        }
      });
    });

    return edges;
  }, [layoutClusters]);

  const handleClusterClick = (clusterId: string) => {
    onSelectCluster?.(clusterId);
  };

  return (
    <div className="cluster-visualization">
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 800 ${height}`}
        className="visualization-svg"
      >
        {/* Connections */}
        {connections.map(([i, j, similarity], idx) => {
          const c1 = layoutClusters[i];
          const c2 = layoutClusters[j];

          return (
            <line
              key={`connection-${idx}`}
              x1={c1.x}
              y1={c1.y}
              x2={c2.x}
              y2={c2.y}
              className="cluster-connection"
              opacity={Math.min(0.8, similarity + 0.1)}
              strokeWidth={Math.max(1, similarity * 3)}
            />
          );
        })}

        {/* Cluster circles */}
        {layoutClusters.map((cluster) => (
          <g
            key={cluster.id}
            className={`cluster-node ${
              selectedClusterId === cluster.id ? "selected" : ""
            }`}
            onClick={() => handleClusterClick(cluster.id)}
            style={{ cursor: "pointer" }}
          >
            {/* Circle */}
            <circle
              cx={cluster.x}
              cy={cluster.y}
              r={cluster.radius}
              className="cluster-circle"
              fill={getClusterColor(cluster.pageType)}
              opacity={selectedClusterId === cluster.id ? 1 : 0.8}
            />

            {/* Selection ring */}
            {selectedClusterId === cluster.id && (
              <circle
                cx={cluster.x}
                cy={cluster.y}
                r={cluster.radius + 5}
                className="cluster-selected-ring"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}

            {/* Priority indicator (inner circle size) */}
            <circle
              cx={cluster.x}
              cy={cluster.y}
              r={cluster.radius * (0.5 + cluster.priority * 0.4)}
              className="cluster-inner"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />

            {/* Label */}
            <text
              x={cluster.x}
              y={cluster.y}
              className="cluster-label"
              textAnchor="middle"
              dy="0.3em"
              fontSize="12"
              fontWeight="bold"
              fill="white"
              pointerEvents="none"
            >
              {truncateText(cluster.pillarKeyword, 15)}
            </text>

            {/* Info on hover */}
            <title>
              {cluster.pillarKeyword}
              {"\n"}
              Priority: {(cluster.priority * 100).toFixed(0)}%{"\n"}
              Keywords: {cluster.memberCount}
            </title>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="visualization-legend">
        <div className="legend-title">Legend</div>
        <div className="legend-items">
          <div className="legend-item">
            <span
              className="legend-box"
              style={{ backgroundColor: getClusterColor("article") }}
            />
            Article
          </div>
          <div className="legend-item">
            <span
              className="legend-box"
              style={{ backgroundColor: getClusterColor("faq") }}
            />
            FAQ
          </div>
          <div className="legend-item">
            <span
              className="legend-box"
              style={{ backgroundColor: getClusterColor("category") }}
            />
            Category
          </div>
          <div className="legend-item">
            <span
              className="legend-box"
              style={{ backgroundColor: getClusterColor("landing") }}
            />
            Landing Page
          </div>
        </div>
        <p className="legend-note">Circle size = Priority Score</p>
      </div>
    </div>
  );
};

function getClusterColor(pageType: string): string {
  const colorMap: Record<string, string> = {
    article: "#3b82f6",
    faq: "#10b981",
    category: "#f59e0b",
    landing: "#ef4444",
    comparison: "#8b5cf6",
    glossary: "#ec4899",
    topic_page: "#06b6d4",
  };

  return colorMap[pageType.toLowerCase()] || "#6b7280";
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

export default ClusterVisualization;
