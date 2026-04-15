/**
 * Cluster List Component
 * Phase 3.3: Paginated table view of clusters with sorting and filtering
 */

import React, { useMemo, useState } from "react";
import type { Cluster } from "../types/api";

interface ClusterListProps {
  clusters: Cluster[];
  onSelectCluster?: (cluster: Cluster) => void;
  isLoading?: boolean;
  pageSize?: number;
  onGenerateContent?: (clusterId: string) => Promise<void>;
}

type SortField = "pillarKeyword" | "pageType" | "priority" | "competitionScore";
type SortOrder = "asc" | "desc";

interface FilterState {
  pageType: string | null;
  minPriority: number;
  maxCompetition: number;
  searchQuery: string;
}

export const ClusterList: React.FC<ClusterListProps> = ({
  clusters,
  onSelectCluster,
  isLoading = false,
  pageSize = 20,
  onGenerateContent,
}) => {
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    pageType: null,
    minPriority: 0,
    maxCompetition: 100,
    searchQuery: "",
  });
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Filter clusters
  const filteredClusters = useMemo(() => {
    return clusters.filter((cluster) => {
      // Page type filter
      if (filters.pageType && cluster.pageType !== filters.pageType) {
        return false;
      }

      // Priority filter
      if (cluster.priority < filters.minPriority) {
        return false;
      }

      // Competition filter
      if (cluster.competitionScore > filters.maxCompetition) {
        return false;
      }

      // Search filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        return (
          cluster.pillarKeyword.toLowerCase().includes(query) ||
          cluster.keywords.some((kw) => kw.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [clusters, filters]);

  // Sort clusters
  const sortedClusters = useMemo(() => {
    const sorted = [...filteredClusters].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;

      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [filteredClusters, sortField, sortOrder]);

  // Paginate
  const totalPages = Math.ceil(sortedClusters.length / pageSize);
  const paginatedClusters = sortedClusters.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleGenerateContent = async (
    e: React.MouseEvent,
    clusterId: string,
  ) => {
    e.stopPropagation();
    if (!onGenerateContent) return;

    setGeneratingId(clusterId);
    try {
      await onGenerateContent(clusterId);
    } finally {
      setGeneratingId(null);
    }
  };

  const pageTypes = Array.from(new Set(clusters.map((c) => c.pageType))).sort();

  return (
    <div className="cluster-list">
      {/* Filters */}
      <div className="filters-panel">
        <div className="filter-group">
          <label htmlFor="search-input">Search</label>
          <input
            id="search-input"
            type="text"
            placeholder="Search keywords or clusters..."
            value={filters.searchQuery}
            onChange={(e) =>
              setFilters({ ...filters, searchQuery: e.target.value })
            }
            className="input-field"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="page-type-select">Page Type</label>
          <select
            id="page-type-select"
            value={filters.pageType || ""}
            onChange={(e) =>
              setFilters({ ...filters, pageType: e.target.value || null })
            }
            className="input-field"
          >
            <option value="">All Types</option>
            {pageTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="min-priority-input">
            Min Priority: {(filters.minPriority * 100).toFixed(0)}%
          </label>
          <input
            id="min-priority-input"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={filters.minPriority}
            onChange={(e) =>
              setFilters({
                ...filters,
                minPriority: parseFloat(e.target.value),
              })
            }
            className="input-range"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="max-competition-input">
            Max Competition: {filters.maxCompetition}
          </label>
          <input
            id="max-competition-input"
            type="range"
            min="0"
            max="100"
            step="5"
            value={filters.maxCompetition}
            onChange={(e) =>
              setFilters({
                ...filters,
                maxCompetition: parseInt(e.target.value),
              })
            }
            className="input-range"
          />
        </div>

        <button
          className="btn btn-secondary"
          onClick={() =>
            setFilters({
              pageType: null,
              minPriority: 0,
              maxCompetition: 100,
              searchQuery: "",
            })
          }
        >
          Reset Filters
        </button>
      </div>

      {/* Summary */}
      <div className="list-summary">
        <p className="result-count">
          {isLoading ? "Loading..." : `${sortedClusters.length} clusters`}
        </p>
      </div>

      {/* Table */}
      <div className="clusters-table">
        {paginatedClusters.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>
                  <button
                    className="sort-header"
                    onClick={() => handleSort("pillarKeyword")}
                  >
                    Pillar Keyword
                    {sortField === "pillarKeyword" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>
                  <button
                    className="sort-header"
                    onClick={() => handleSort("pageType")}
                  >
                    Page Type
                    {sortField === "pageType" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th className="align-right">
                  <button
                    className="sort-header"
                    onClick={() => handleSort("priority")}
                  >
                    Priority
                    {sortField === "priority" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th className="align-right">
                  <button
                    className="sort-header"
                    onClick={() => handleSort("competitionScore")}
                  >
                    Competition
                    {sortField === "competitionScore" && (
                      <span className="sort-indicator">
                        {sortOrder === "asc" ? " ↑" : " ↓"}
                      </span>
                    )}
                  </button>
                </th>
                <th>Keywords</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedClusters.map((cluster) => (
                <tr
                  key={cluster.id}
                  className="cluster-row"
                  onClick={() => onSelectCluster?.(cluster)}
                >
                  <td>
                    <strong>{cluster.pillarKeyword}</strong>
                  </td>
                  <td>
                    <span className="badge badge-outline">
                      {cluster.pageType}
                    </span>
                  </td>
                  <td className="align-right">
                    <div className="priority-indicator">
                      <span className="value">
                        {(cluster.priority * 100).toFixed(0)}%
                      </span>
                      <div className="progress-bar-small">
                        <div
                          className="progress-fill"
                          style={{ width: `${cluster.priority * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="align-right">
                    <span className="competition-score">
                      {cluster.competitionScore}
                    </span>
                  </td>
                  <td>
                    <span className="keyword-count">
                      {cluster.memberCount} keywords
                    </span>
                  </td>
                  <td className="actions-cell">
                    {onGenerateContent && (
                      <button
                        onClick={(e) => handleGenerateContent(e, cluster.id)}
                        disabled={generatingId === cluster.id}
                        className="btn-icon"
                        title="Generate content plan"
                      >
                        {generatingId === cluster.id ? "..." : "⚡"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>
              {filters.searchQuery || filters.pageType
                ? "No clusters match your filters"
                : "No clusters available"}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="btn-small"
          >
            ← Previous
          </button>

          <div className="page-info">
            Page {currentPage + 1} of {totalPages}
          </div>

          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
            }
            disabled={currentPage === totalPages - 1}
            className="btn-small"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default ClusterList;
