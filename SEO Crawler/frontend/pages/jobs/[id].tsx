import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import {
  getJob,
  getJobResults,
  getExportUrl,
  Job,
  JobResult,
} from "../../src/utils/api";
import { useRealtime } from "../../src/hooks/useRealtime";
import { JobRealtimeStatus } from "../../src/components/JobRealtimeStatus";
import { AnalysisStreaming } from "../../src/components/AnalysisStreaming";

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const jobId = id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [results, setResults] = useState<JobResult[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Real-time updates via SSE
  const { isConnected, lastEvent } = useRealtime({
    jobId,
    enabled: !!jobId && polling,
    onMessage: (event) => {
      if (event.type === "progress") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: event.data.status || prev.status,
                resultCount: event.data.resultCount || prev.resultCount || 0,
              }
            : null,
        );
      } else if (event.type === "complete") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "completed",
                resultCount: event.data.resultCount || prev.resultCount || 0,
              }
            : null,
        );
        setPolling(false);
      }
    },
  });

  // 轮询任务状态
  useEffect(() => {
    if (!jobId) return;

    const pollJob = async () => {
      try {
        const updated = await getJob(jobId);
        setJob(updated);

        // 如果任务已完成或失败，停止轮询
        if (updated.status !== "waiting" && updated.status !== "running") {
          setPolling(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "获取任务状态失败";
        setError(msg);
      }
    };

    // 立即执行一次
    pollJob();

    // 如果还在轮询，设置定时器
    if (polling) {
      const interval = setInterval(pollJob, 3000);
      return () => clearInterval(interval);
    }
  }, [jobId, polling]);

  // 获取结果
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        const response = await getJobResults(jobId, page + 1, 25);
        setResults(response.keywords);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "获取结果失败";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [jobId, job?.status, page]);

  // 过滤结果
  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const sourceMatch = !sourceFilter || result.source === sourceFilter;
      const intentMatch = !intentFilter || result.intent === intentFilter;
      return sourceMatch && intentMatch;
    });
  }, [results, sourceFilter, intentFilter]);

  // 定义表格列
  const columns: ColumnDef<JobResult>[] = [
    {
      accessorKey: "normalizedKeyword",
      header: "Keyword",
      cell: (info) => info.getValue(),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: (info) => (
        <span className="badge" style={{ fontSize: "0.8rem" }}>
          {String(info.getValue())}
        </span>
      ),
    },
    {
      accessorKey: "intent",
      header: "Intent",
      cell: (info) => (
        <span className="badge" style={{ fontSize: "0.8rem" }}>
          {String(info.getValue())}
        </span>
      ),
    },
    {
      accessorKey: "score",
      header: "Score",
      cell: (info) => (
        <strong>{Math.round((info.getValue() as number) * 100) / 100}</strong>
      ),
    },
    {
      accessorKey: "rawKeyword",
      header: "Raw",
      cell: (info) => (
        <span title={info.getValue() as string}>
          {((info.getValue() as string) || "").substring(0, 30)}
          {((info.getValue() as string) || "").length > 30 ? "..." : ""}
        </span>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredResults,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 25,
      },
    },
  });

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const getStatusBadgeClass = (status: string) => {
    return `badge badge-${status}`;
  };

  const getDuration = () => {
    if (!job?.finishedAt) return "--";
    const seconds = job.finishedAt - job.createdAt;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  if (!jobId) {
    return <div className="loading">加载中...</div>;
  }

  if (!job) {
    return <div className="error-message">{error || "任务不存在"}</div>;
  }

  return (
    <>
      <Head>
        <title>{job.seed} - SEO Crawler</title>
        <meta name="description" content={`Task details for ${job.seed}`} />
      </Head>

      <div className="job-detail-container">
        {/* 任务状态头部 */}
        <div className="job-header">
          <div className="job-title">
            <h1>{job.seed}</h1>
            <span className={getStatusBadgeClass(job.status)}>
              {job.status.toUpperCase()}
            </span>
          </div>

          <div className="job-meta">
            <div className="meta-item">
              <span className="label">Sources:</span>
              <span className="value">
                {typeof job.sources === "string"
                  ? job.sources
                  : job.sources.join(", ")}
              </span>
            </div>
            <div className="meta-item">
              <span className="label">Created:</span>
              <span className="value">{formatTime(job.createdAt)}</span>
            </div>
            {job.finishedAt && (
              <div className="meta-item">
                <span className="label">Duration:</span>
                <span className="value">{getDuration()}</span>
              </div>
            )}
            <div className="meta-item">
              <span className="label">Results:</span>
              <span className="value">{results.length}</span>
            </div>
          </div>
        </div>

        {/* 实时状态面板 */}
        {job && (
          <JobRealtimeStatus
            jobStatus={job.status}
            resultCount={job.resultCount || results.length}
            isConnected={isConnected}
            lastEvent={lastEvent}
          />
        )}

        {error && <div className="error-message">{error}</div>}

        {/* 轮询提示 */}
        {polling && (
          <div className="info-message">
            <span className="spinner"></span> Task is running...
            Auto-refreshing...
          </div>
        )}

        {/* 错误状态 */}
        {job.status === "failed" && job.errorMessage && (
          <div className="error-message">
            <strong>Error:</strong> {job.errorMessage}
          </div>
        )}

        {/* 结果表格 */}
        {job.status === "completed" && (
          <>
            {/* 过滤器 */}
            <div className="filters">
              <div className="filter-group">
                <label htmlFor="source-filter">Source:</label>
                <select
                  id="source-filter"
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All</option>
                  {["google", "bing"].map((source) => (
                    <option key={source} value={source}>
                      {source.charAt(0).toUpperCase() + source.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label htmlFor="intent-filter">Intent:</label>
                <select
                  id="intent-filter"
                  value={intentFilter}
                  onChange={(e) => {
                    setIntentFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All</option>
                  {[
                    "informational",
                    "commercial",
                    "transactional",
                    "navigational",
                    "other",
                  ].map((intent) => (
                    <option key={intent} value={intent}>
                      {intent.charAt(0).toUpperCase() + intent.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <a
                href={getExportUrl(jobId)}
                className="button button-secondary button-small"
                download
              >
                📥 Download CSV
              </a>
            </div>

            {/* 表格 */}
            {loading ? (
              <div className="loading">
                <span className="spinner"></span> Loading results...
              </div>
            ) : (
              <>
                <div className="table-container">
                  <table>
                    <thead>
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <th key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.map((row) => (
                        <tr key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                <div className="pagination">
                  <button
                    className="button button-small"
                    onClick={() => setPage(Math.max(page - 1, 0))}
                    disabled={page === 0}
                  >
                    ← Previous
                  </button>
                  <span className="page-info">
                    Page {page + 1} of {Math.ceil(results.length / 25)}
                  </span>
                  <button
                    className="button button-small"
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * 25 >= results.length}
                  >
                    Next →
                  </button>
                </div>

                {/* 分析流按钮 */}
                <div style={{ marginTop: "2rem" }}>
                  <button
                    className="button button-primary"
                    onClick={() => setShowAnalysis(!showAnalysis)}
                  >
                    {showAnalysis ? "Hide Analysis" : "View AI Analysis"}
                  </button>
                </div>
              </>
            )}

            {/* 流式分析面板 */}
            {showAnalysis && (
              <div style={{ marginTop: "2rem" }}>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>
                  AI Analysis
                </h2>
                <AnalysisStreaming
                  jobId={jobId}
                  analysisType="difficulty_insights"
                  enabled={job.status === "completed"}
                />
                <AnalysisStreaming
                  jobId={jobId}
                  analysisType="roi_opportunities"
                  enabled={job.status === "completed"}
                />
                <AnalysisStreaming
                  jobId={jobId}
                  analysisType="competitor_gaps"
                  enabled={job.status === "completed"}
                />
              </div>
            )}
          </>
        )}

        {job.status !== "completed" && job.status !== "failed" && (
          <div className="info-message">
            Waiting for task to complete... This page will update automatically.
          </div>
        )}
      </div>

      <style jsx>{`
        .job-detail-container {
          max-width: 1200px;
          margin: 0 auto;
          background-color: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .job-header {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 2px solid #eee;
        }

        .job-title {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .job-title h1 {
          margin: 0;
          font-size: 1.8rem;
        }

        .job-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
        }

        .meta-item .label {
          font-weight: 600;
          color: #666;
          font-size: 0.9rem;
        }

        .meta-item .value {
          color: #333;
          margin-top: 0.25rem;
        }

        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
        }

        .filter-group label {
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #333;
          font-size: 0.9rem;
        }

        .filter-group select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .table-container {
          overflow-x: auto;
          margin-bottom: 2rem;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
        }

        .page-info {
          color: #666;
          font-weight: 500;
        }

        .spinner {
          display: inline-block;
          margin-right: 0.5rem;
          vertical-align: middle;
        }

        @media (max-width: 768px) {
          .job-detail-container {
            padding: 1rem;
          }

          .job-title {
            flex-direction: column;
            align-items: flex-start;
          }

          .job-meta {
            grid-template-columns: 1fr;
          }

          .filters {
            flex-direction: column;
          }

          .filter-group select {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
