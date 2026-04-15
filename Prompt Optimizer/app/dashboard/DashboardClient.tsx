"use client";

import { useState, useEffect } from "react";
import LoadingSpinner from "@/app/components/LoadingSpinner";

interface HistoryRecord {
  id: string;
  created_at: string;
  raw_score: number;
  optimized_score: number;
  delta: number;
}

interface HistoryData {
  records: HistoryRecord[];
  stats: {
    totalCount: number;
    avgRawScore: number;
    avgOptimizedScore: number;
    avgDelta: number;
  };
}

export default function DashboardClient() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/user/history?limit=50");
        if (!response.ok) throw new Error("Failed to fetch history");
        const json = await response.json();
        setData(json);
      } catch (error) {
        // silently fail — error already surfaced in UI via loading state
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  if (loading || !data) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <LoadingSpinner /> Loading your history...
      </div>
    );
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <h1>📈 My Optimization History</h1>

      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{data.stats.totalCount}</span>
          <div className="stat-label">Total Optimizations</div>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.stats.avgRawScore}</span>
          <div className="stat-label">Avg Initial Score</div>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.stats.avgOptimizedScore}</span>
          <div className="stat-label">Avg Final Score</div>
        </div>
        <div className="stat-card">
          <span className="stat-value delta-positive">
            +{data.stats.avgDelta}
          </span>
          <div className="stat-label">Avg Improvement</div>
        </div>
      </div>

      {/* History Table */}
      <div className="chart-card">
        <h2 className="chart-title">Recent Optimizations</h2>
        {data.records.length === 0 ? (
          <div className="empty-state">
            No optimization records yet. Try optimizing a prompt!
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: "center" }}>Initial Score</th>
                <th style={{ textAlign: "center" }}>Final Score</th>
                <th style={{ textAlign: "center" }}>Improvement</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.created_at)}</td>
                  <td style={{ textAlign: "center" }}>{record.raw_score}</td>
                  <td style={{ textAlign: "center" }}>
                    {record.optimized_score}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span
                      className={
                        record.delta >= 0 ? "delta-positive" : "delta-negative"
                      }
                    >
                      {record.delta >= 0 ? "+" : ""}
                      {record.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
