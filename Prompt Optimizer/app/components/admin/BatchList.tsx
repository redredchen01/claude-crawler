"use client";

import { useEffect, useState } from "react";

export interface BatchListItem {
  id: string;
  batchName: string;
  status: string;
  userId: string;
  teamId?: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progressPercent: number;
}

interface BatchListProps {
  data?: { batches: BatchListItem[]; total: number };
  loading?: boolean;
  error?: string;
  onSelectBatch?: (batch: BatchListItem) => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-yellow-100 text-yellow-800",
  partially_failed: "bg-orange-100 text-orange-800",
};

export default function BatchList({
  data: providedData,
  loading = false,
  error: providedError,
  onSelectBatch,
}: BatchListProps) {
  const [data, setData] = useState<{
    batches: BatchListItem[];
    total: number;
  } | null>(providedData || null);
  const [isLoading, setIsLoading] = useState(loading);
  const [error, setError] = useState(providedError);
  const [filters, setFilters] = useState({
    status: "",
    limit: 50,
    offset: 0,
  });

  useEffect(() => {
    if (providedData) {
      setData(providedData);
    }
  }, [providedData]);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({
          limit: filters.limit.toString(),
          offset: filters.offset.toString(),
        });

        if (filters.status) {
          params.append("status", filters.status);
        }

        const response = await fetch(`/api/admin/batches?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch batches: ${response.statusText}`);
        }

        const result = await response.json();
        const formattedBatches = result.batches.map((b: any) => ({
          ...b,
          createdAt: new Date(b.createdAt),
          startedAt: b.startedAt ? new Date(b.startedAt) : undefined,
          completedAt: b.completedAt ? new Date(b.completedAt) : undefined,
        }));

        setData({ batches: formattedBatches, total: result.total });
        setError(undefined);
      } catch (err: any) {
        setError(err.message || "Failed to load batch list");
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch if data not provided
    if (!providedData) {
      fetchBatches();
    }
  }, [filters, providedData]);

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

  const batches = data?.batches || [];

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Recent Batch Jobs
      </h3>

      {/* Filters */}
      <div className="mb-4 flex gap-4">
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters({ ...filters, status: e.target.value, offset: 0 })
          }
          className="px-3 py-2 rounded-md border border-gray-300 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={filters.limit}
          onChange={(e) =>
            setFilters({
              ...filters,
              limit: parseInt(e.target.value),
              offset: 0,
            })
          }
          className="px-3 py-2 rounded-md border border-gray-300 text-sm"
        >
          <option value="10">10 per page</option>
          <option value="25">25 per page</option>
          <option value="50">50 per page</option>
          <option value="100">100 per page</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Batch Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Items
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {batches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No batch jobs found
                </td>
              </tr>
            ) : (
              batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onSelectBatch?.(batch)}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {batch.batchName}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        statusColors[batch.status] ||
                        "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${batch.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">
                        {batch.progressPercent}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {batch.processedItems + batch.failedItems} /{" "}
                    {batch.totalItems}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {batch.createdAt.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > filters.limit && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Showing {filters.offset + 1} to{" "}
            {Math.min(filters.offset + filters.limit, data.total)} of{" "}
            {data.total} batches
          </span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setFilters({
                  ...filters,
                  offset: Math.max(0, filters.offset - filters.limit),
                })
              }
              disabled={filters.offset === 0}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setFilters({
                  ...filters,
                  offset: filters.offset + filters.limit,
                })
              }
              disabled={filters.offset + filters.limit >= data.total}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
