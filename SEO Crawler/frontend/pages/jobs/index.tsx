import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";
import { listJobs, Job } from "../../src/utils/api";

export default function JobsListPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch jobs on mount and when page changes
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const response = await listJobs(page + 1, 10);
        setJobs(response.jobs);
        setTotal(response.total);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "获取任务列表失败";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [page]);

  // Define table columns
  const columns: ColumnDef<Job>[] = [
    {
      accessorKey: "seed",
      header: "Seed",
      cell: (info) => (
        <strong>{(info.getValue() as string).substring(0, 50)}</strong>
      ),
    },
    {
      accessorKey: "sources",
      header: "Sources",
      cell: (info) => {
        const sources = info.getValue() as string[];
        return (
          <span>
            {sources.map((source) => (
              <span
                key={source}
                className="badge badge-info"
                style={{ marginRight: "0.25rem" }}
              >
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => {
        const status = info.getValue() as string;
        return (
          <span className={`badge badge-${status}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: (info) => {
        const timestamp = info.getValue() as number;
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
      },
    },
    {
      id: "actions",
      header: "Action",
      cell: (info) => {
        const jobId = info.row.original.id;
        return (
          <button
            className="button button-primary button-small"
            onClick={() => router.push(`/jobs/${jobId}`)}
          >
            View
          </button>
        );
      },
    },
  ];

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  });

  return (
    <>
      <Head>
        <title>任务列表 - SEO Crawler</title>
        <meta name="description" content="SEO爬虫任务历史记录" />
      </Head>

      <div className="jobs-list-container">
        <div className="list-header">
          <h1>任务列表</h1>
          <Link href="/" className="button button-primary button-small">
            + 新建任务
          </Link>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">
            <span className="spinner"></span> 加载中...
          </div>
        ) : jobs.length === 0 ? (
          <div className="info-message">
            还没有任务。
            <Link href="/" style={{ marginLeft: "0.5rem" }}>
              创建新任务
            </Link>
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

            {/* Pagination */}
            <div className="pagination">
              <button
                className="button button-small"
                onClick={() => setPage(Math.max(page - 1, 0))}
                disabled={page === 0}
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {page + 1} of {Math.ceil(total / 10)} (Total: {total})
              </span>
              <button
                className="button button-small"
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * 10 >= total}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .jobs-list-container {
          max-width: 1200px;
          margin: 0 auto;
          background-color: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #eee;
        }

        .list-header h1 {
          margin: 0;
          font-size: 1.8rem;
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
          min-width: 200px;
          text-align: center;
        }

        .spinner {
          display: inline-block;
          margin-right: 0.5rem;
          vertical-align: middle;
        }

        .badge-info {
          background-color: #e3f2fd;
          color: #1976d2;
        }

        @media (max-width: 768px) {
          .jobs-list-container {
            padding: 1rem;
          }

          .list-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }

          .list-header h1 {
            width: 100%;
            margin-bottom: 0;
          }

          .list-header a {
            width: 100%;
            text-align: center;
          }

          .pagination {
            flex-wrap: wrap;
          }

          .page-info {
            min-width: 100%;
          }
        }
      `}</style>
    </>
  );
}
