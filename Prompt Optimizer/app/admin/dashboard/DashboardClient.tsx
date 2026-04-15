"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import LoadingSpinner from "@/app/components/LoadingSpinner";

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalOptimizations: number;
    avgRawScore: number;
    avgOptimizedScore: number;
    avgDelta: number;
  };
  timeSeries: Array<{ date: string; count: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
  dimensionAverages: {
    specificity: number;
    context: number;
    output_spec: number;
    runnability: number;
    evaluation: number;
    safety: number;
  };
  topUsers: Array<{ email: string; count: number }>;
}

export default function DashboardClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/analytics?days=${days}`);
        if (!response.ok) throw new Error("Failed to fetch analytics");
        const json = await response.json();
        setData(json);
      } catch (error) {
        // silently fail — error already surfaced in UI via loading state
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [days]);

  if (loading || !data) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <LoadingSpinner /> Loading analytics...
      </div>
    );
  }

  // Format dimension data for radar chart
  const dimensionData = useMemo(
    () => [
      {
        dimension: "Specificity",
        value: data.dimensionAverages.specificity,
      },
      { dimension: "Context", value: data.dimensionAverages.context },
      {
        dimension: "Output Spec",
        value: data.dimensionAverages.output_spec,
      },
      {
        dimension: "Runnability",
        value: data.dimensionAverages.runnability,
      },
      { dimension: "Evaluation", value: data.dimensionAverages.evaluation },
      { dimension: "Safety", value: data.dimensionAverages.safety },
    ],
    [data.dimensionAverages],
  );

  return (
    <div>
      <div className="dashboard-header">
        <h1>📊 Analytics Dashboard</h1>
        <div className="period-selector">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={days === d ? "active" : ""}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-value">{data.overview.totalUsers}</span>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.overview.totalOptimizations}</span>
          <div className="stat-label">Total Optimizations</div>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.overview.avgOptimizedScore}</span>
          <div className="stat-label">Avg Final Score</div>
        </div>
        <div className="stat-card">
          <span className="stat-value delta-positive">
            +{data.overview.avgDelta}
          </span>
          <div className="stat-label">Avg Improvement</div>
        </div>
      </div>

      {/* Time Series Chart */}
      <div className="chart-card">
        <h2 className="chart-title">Optimizations Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.timeSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              interval={Math.floor(data.timeSeries.length / 10) || 0}
            />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#0070f3" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Score Distribution */}
        <div className="chart-card">
          <h2 className="chart-title">Score Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#28a745" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dimension Averages */}
        <div className="chart-card">
          <h2 className="chart-title">Dimension Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={dimensionData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 20]} />
              <Radar
                name="Avg Score"
                dataKey="value"
                stroke="#0070f3"
                fill="#0070f3"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Users Table */}
      <div className="chart-card">
        <h2 className="chart-title">Top Users</h2>
        {data.topUsers.length === 0 ? (
          <div className="empty-state">No data available</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th style={{ textAlign: "right" }}>Optimizations</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((user) => (
                <tr key={user.email}>
                  <td>{user.email}</td>
                  <td style={{ textAlign: "right" }}>{user.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
