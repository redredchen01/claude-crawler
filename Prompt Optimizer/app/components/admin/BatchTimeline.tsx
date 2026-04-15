"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface TimelinePoint {
  timestamp: Date;
  completed: number;
  failed: number;
  processing: number;
}

interface BatchTimelineProps {
  hoursBack?: number;
  data?: TimelinePoint[];
  loading?: boolean;
  error?: string;
}

export default function BatchTimeline({
  hoursBack = 24,
  data: providedData,
  loading = false,
  error: providedError,
}: BatchTimelineProps) {
  const [data, setData] = useState<TimelinePoint[]>(providedData || []);
  const [isLoading, setIsLoading] = useState(loading);
  const [error, setError] = useState(providedError);

  useEffect(() => {
    if (providedData) {
      setData(providedData);
    }
  }, [providedData]);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/admin/batches/timeline?hoursBack=${hoursBack}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch timeline: ${response.statusText}`);
        }
        const result = await response.json();
        const formattedData = result.points.map((p: any) => ({
          ...p,
          timestamp: new Date(p.timestamp),
        }));
        setData(formattedData);
        setError(undefined);
      } catch (err: any) {
        setError(err.message || "Failed to load timeline data");
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if data not provided
    if (!providedData) {
      fetchTimeline();
      // Refresh every 60 seconds
      const interval = setInterval(fetchTimeline, 60000);
      return () => clearInterval(interval);
    }
  }, [hoursBack, providedData]);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-96 bg-gray-200 rounded-lg animate-pulse" />;
  }

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        time: point.timestamp.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        completed: point.completed,
        failed: point.failed,
        processing: point.processing,
      })),
    [data],
  );

  const tooltipFormatter = useCallback((value) => [value, ""], []);

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Batch Completion Timeline ({hoursBack}h)
      </h3>
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        {chartData.length === 0 ? (
          <div className="h-96 flex items-center justify-center text-gray-500">
            No data available for the selected time range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#10b981"
                name="Completed"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke="#ef4444"
                name="Failed"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="processing"
                stroke="#f59e0b"
                name="Processing"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
