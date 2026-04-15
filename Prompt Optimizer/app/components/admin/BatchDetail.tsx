"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface BatchTimelineEvent {
  timestamp: Date;
  event: string;
  status: string;
  processedCount?: number;
  failedCount?: number;
  details?: string;
}

export interface BatchJobTimeline {
  jobId: string;
  batchName: string;
  status: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt?: Date;
  completedAt?: Date;
  events: BatchTimelineEvent[];
}

interface BatchDetailProps {
  jobId: string;
  data?: BatchJobTimeline;
  loading?: boolean;
  error?: string;
  onClose?: () => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-yellow-100 text-yellow-800",
  partially_failed: "bg-orange-100 text-orange-800",
};

export default function BatchDetail({
  jobId,
  data: providedData,
  loading = false,
  error: providedError,
  onClose,
}: BatchDetailProps) {
  const [data, setData] = useState<BatchJobTimeline | null>(
    providedData || null,
  );
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
        const response = await fetch(`/api/admin/batches/${jobId}/timeline`);
        if (!response.ok) {
          throw new Error(`Failed to fetch timeline: ${response.statusText}`);
        }
        const result = await response.json();
        const formattedData: BatchJobTimeline = {
          ...result,
          startedAt: result.startedAt ? new Date(result.startedAt) : undefined,
          completedAt: result.completedAt
            ? new Date(result.completedAt)
            : undefined,
          events: result.events.map((e: any) => ({
            ...e,
            timestamp: new Date(e.timestamp),
          })),
        };
        setData(formattedData);
        setError(undefined);
      } catch (err: any) {
        setError(err.message || "Failed to load batch timeline");
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if data not provided
    if (!providedData) {
      fetchTimeline();
      // Refresh every 10 seconds
      const interval = setInterval(fetchTimeline, 10000);
      return () => clearInterval(interval);
    }
  }, [jobId, providedData]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Batch Job Detail
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Batch Job Detail
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const successRate =
    data.totalItems > 0
      ? Math.round(
          ((data.totalItems - data.failedItems) / data.totalItems) * 100,
        )
      : 0;

  const duration =
    data.startedAt && data.completedAt
      ? Math.round(
          (data.completedAt.getTime() - data.startedAt.getTime()) / 1000,
        )
      : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {data.batchName}
            </h2>
            <p className="text-xs text-gray-500 mt-1">Job ID: {data.jobId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600">Status</div>
              <div className="mt-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[data.status] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {data.status}
                </span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600">
                Items Processed
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {data.processedItems}/{data.totalItems}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600">Success</div>
              <div className="mt-2 text-2xl font-bold text-green-600">
                {successRate}%
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600">Duration</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">
                {duration ? `${duration}s` : "—"}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Timeline Events
            </h3>
            {data.events.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No events recorded
              </div>
            ) : (
              <div className="space-y-2">
                {data.events.map((event, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-shrink-0 pt-1">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold">
                        {idx + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {event.event}
                        </p>
                        <p className="text-xs text-gray-500">
                          {event.timestamp.toLocaleString()}
                        </p>
                      </div>
                      {event.processedCount !== undefined && (
                        <p className="text-xs text-gray-600 mt-1">
                          Processed: {event.processedCount}, Failed:{" "}
                          {event.failedCount}
                        </p>
                      )}
                      {event.details && (
                        <p className="text-xs text-gray-600 mt-1">
                          {event.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
