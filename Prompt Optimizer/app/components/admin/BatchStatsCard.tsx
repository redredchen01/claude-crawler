"use client";

import { memo, useEffect, useMemo, useState } from "react";

export interface BatchStatsData {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  processingBatches: number;
  totalPrompts: number;
  processedPrompts: number;
  failedPrompts: number;
  averageProcessingTimeMs: number;
  throughputPerMinute: number;
}

interface BatchStatsCardProps {
  stats?: BatchStatsData;
  loading?: boolean;
  error?: string;
}

const StatCard = memo(
  ({
    label,
    value,
    unit = "",
    trend,
  }: {
    label: string;
    value: string | number;
    unit?: string;
    trend?: { value: number; direction: "up" | "down" };
  }) => (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="text-sm font-medium text-gray-600">{label}</div>
      <div className="mt-2 flex items-baseline">
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {unit && <span className="ml-2 text-sm text-gray-500">{unit}</span>}
      </div>
      {trend && (
        <div
          className={`mt-2 text-sm font-medium ${
            trend.direction === "up" ? "text-green-600" : "text-red-600"
          }`}
        >
          {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  ),
);

export default function BatchStatsCard({
  stats,
  loading = false,
  error,
}: BatchStatsCardProps) {
  const [data, setData] = useState<BatchStatsData | null>(stats || null);
  const [isLoading, setIsLoading] = useState(loading);
  const [errorMsg, setErrorMsg] = useState(error);

  useEffect(() => {
    if (stats) {
      setData(stats);
    }
  }, [stats]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/admin/batches/stats");
        if (!response.ok) {
          throw new Error(`Failed to fetch stats: ${response.statusText}`);
        }
        const statsData = await response.json();
        setData(statsData);
        setErrorMsg(undefined);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load batch statistics");
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if stats not provided
    if (!stats) {
      fetchStats();
      // Refresh every 30 seconds
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [stats]);

  if (errorMsg) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {errorMsg}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array(9)
          .fill(0)
          .map((_, i) => (
            <div
              key={i}
              className="h-28 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const successRate = useMemo(
    () =>
      data.totalPrompts > 0
        ? Math.round(
            ((data.totalPrompts - data.failedPrompts) / data.totalPrompts) *
              100,
          )
        : 0,
    [data.totalPrompts, data.failedPrompts],
  );

  const completionRate = useMemo(
    () =>
      data.totalBatches > 0
        ? Math.round((data.completedBatches / data.totalBatches) * 100)
        : 0,
    [data.totalBatches, data.completedBatches],
  );

  const processedRate = useMemo(
    () =>
      data.totalPrompts > 0
        ? Math.round((data.processedPrompts / data.totalPrompts) * 100)
        : 0,
    [data.totalPrompts, data.processedPrompts],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Batch Processing Overview
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Batches"
          value={data.totalBatches}
          trend={{ value: 0, direction: "up" }}
        />
        <StatCard
          label="Completed"
          value={data.completedBatches}
          trend={{
            value: completionRate,
            direction: "up",
          }}
        />
        <StatCard
          label="Failed"
          value={data.failedBatches}
          trend={{ value: 0, direction: "down" }}
        />

        <StatCard
          label="Processing"
          value={data.processingBatches}
          trend={{ value: 0, direction: "up" }}
        />
        <StatCard
          label="Total Prompts"
          value={data.totalPrompts}
          trend={{ value: 0, direction: "up" }}
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          trend={{
            value: successRate,
            direction: successRate >= 95 ? "up" : "down",
          }}
        />

        <StatCard
          label="Avg Processing Time"
          value={Math.round(data.averageProcessingTimeMs / 1000)}
          unit="s"
          trend={{ value: 0, direction: "down" }}
        />
        <StatCard
          label="Throughput"
          value={data.throughputPerMinute}
          unit="prompts/min"
          trend={{ value: 0, direction: "up" }}
        />
        <StatCard
          label="Processed Items"
          value={data.processedPrompts}
          trend={{
            value: processedRate,
            direction: "up",
          }}
        />
      </div>
    </div>
  );
}
