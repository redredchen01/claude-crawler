/**
 * 洞察仪表板组件 (Phase 4.1.4)
 *
 * 展示：
 * - 难度分布直方图
 * - ROI Top 10排行表
 * - 竞争对手热力图
 * - 快速筛选和结果表格
 */

import React, { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
} from "@tanstack/react-table";

interface KeywordInsight {
  id: string;
  normalized_keyword: string;
  source: string;
  intent: string;
  difficulty: number;
  roi_score: number;
  cluster_id?: string;
  cluster_name?: string;
  trend_label?: string;
  recommendation?: string;
}

interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
  veryHard: number;
}

interface InsightsDashboardProps {
  keywords: KeywordInsight[];
  difficultyStats?: {
    distribution: DifficultyDistribution;
  };
  competitorHeatmap?: Array<{
    domain: string;
    frequency: number;
    authority: number;
  }>;
}

/**
 * 难度分布直方图
 */
export const DifficultyHistogram: React.FC<{
  distribution: DifficultyDistribution;
}> = ({ distribution }) => {
  const total =
    distribution.easy +
    distribution.medium +
    distribution.hard +
    distribution.veryHard;
  const maxCount = Math.max(
    distribution.easy,
    distribution.medium,
    distribution.hard,
    distribution.veryHard,
  );

  const getBarPercentage = (count: number) => {
    return total === 0 ? 0 : (count / maxCount) * 100;
  };

  return (
    <div className="difficulty-histogram">
      <h3>关键词难度分布</h3>
      <div className="histogram-bars">
        <div className="bar-group">
          <label>简单 (0-20)</label>
          <div className="bar-container">
            <div
              className="bar easy"
              style={{ width: `${getBarPercentage(distribution.easy)}%` }}
            ></div>
          </div>
          <span className="count">{distribution.easy}</span>
        </div>

        <div className="bar-group">
          <label>中等 (21-50)</label>
          <div className="bar-container">
            <div
              className="bar medium"
              style={{ width: `${getBarPercentage(distribution.medium)}%` }}
            ></div>
          </div>
          <span className="count">{distribution.medium}</span>
        </div>

        <div className="bar-group">
          <label>困难 (51-80)</label>
          <div className="bar-container">
            <div
              className="bar hard"
              style={{ width: `${getBarPercentage(distribution.hard)}%` }}
            ></div>
          </div>
          <span className="count">{distribution.hard}</span>
        </div>

        <div className="bar-group">
          <label>极难 (81-100)</label>
          <div className="bar-container">
            <div
              className="bar very-hard"
              style={{ width: `${getBarPercentage(distribution.veryHard)}%` }}
            ></div>
          </div>
          <span className="count">{distribution.veryHard}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * ROI Top 10表格
 */
export const ROIRankingTable: React.FC<{ keywords: KeywordInsight[] }> = ({
  keywords,
}) => {
  const topKeywords = keywords
    .sort((a, b) => (b.roi_score || 0) - (a.roi_score || 0))
    .slice(0, 10);

  const columns: ColumnDef<KeywordInsight>[] = [
    {
      accessorKey: "normalized_keyword",
      header: "关键词",
      cell: (info) => (
        <strong>{(info.getValue() as string).substring(0, 40)}</strong>
      ),
    },
    {
      accessorKey: "difficulty",
      header: "难度",
      cell: (info) => {
        const diff = info.getValue() as number;
        let color = "#4caf50"; // 绿色
        if (diff > 50) color = "#ff9800"; // 橙色
        if (diff > 80) color = "#f44336"; // 红色
        return <span style={{ color }}>{Math.round(diff)}</span>;
      },
    },
    {
      accessorKey: "roi_score",
      header: "ROI评分",
      cell: (info) => (
        <strong>{Math.round((info.getValue() as number) || 0)}</strong>
      ),
    },
  ];

  const table = useReactTable({
    data: topKeywords,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="roi-ranking-table">
      <h3>ROI Top 10 排行</h3>
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
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * 竞争对手热力图（简化版 - 表格）
 */
export const CompetitorHeatmap: React.FC<{
  competitorData?: Array<{
    domain: string;
    frequency: number;
    authority: number;
  }>;
}> = ({ competitorData }) => {
  if (!competitorData || competitorData.length === 0) {
    return (
      <div className="competitor-heatmap">
        <h3>竞争对手热力图</h3>
        <p>暂无竞争对手数据</p>
      </div>
    );
  }

  const maxFreq = Math.max(...competitorData.map((c) => c.frequency));
  if (!isFinite(maxFreq) || maxFreq === 0) {
    return (
      <div className="competitor-heatmap">
        <h3>竞争对手热力图</h3>
        <p>暂无有效竞争对手数据</p>
      </div>
    );
  }

  return (
    <div className="competitor-heatmap">
      <h3>竞争对手热力图（出现频率）</h3>
      <div className="heatmap-grid">
        {competitorData.slice(0, 10).map((competitor) => {
          const intensity = (competitor.frequency / maxFreq) * 100;
          const bgColor = `rgba(255, 152, 0, ${intensity / 100})`;
          return (
            <div
              key={competitor.domain}
              className="heatmap-cell"
              style={{ backgroundColor: bgColor }}
              title={`${competitor.domain}: 出现${competitor.frequency}次`}
            >
              <small>{competitor.domain}</small>
              <br />
              <small>×{competitor.frequency}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 快速筛选组件
 */
export const InsightsFilter: React.FC<{
  onFilterChange: (filters: {
    difficultyMin: number;
    difficultyMax: number;
    roiMin: number;
    roiMax: number;
  }) => void;
}> = ({ onFilterChange }) => {
  const [difficultyMin, setDifficultyMin] = useState(0);
  const [difficultyMax, setDifficultyMax] = useState(100);
  const [roiMin, setRoiMin] = useState(0);
  const [roiMax, setRoiMax] = useState(100);

  const handleChange = () => {
    onFilterChange({
      difficultyMin,
      difficultyMax,
      roiMin,
      roiMax,
    });
  };

  return (
    <div className="insights-filter">
      <div className="filter-group">
        <label>难度范围</label>
        <input
          type="range"
          min="0"
          max="100"
          value={difficultyMin}
          onChange={(e) => {
            setDifficultyMin(parseInt(e.target.value));
            handleChange();
          }}
        />
        <input
          type="range"
          min="0"
          max="100"
          value={difficultyMax}
          onChange={(e) => {
            setDifficultyMax(parseInt(e.target.value));
            handleChange();
          }}
        />
        <span>
          {difficultyMin} - {difficultyMax}
        </span>
      </div>

      <div className="filter-group">
        <label>ROI范围</label>
        <input
          type="range"
          min="0"
          max="100"
          value={roiMin}
          onChange={(e) => {
            setRoiMin(parseInt(e.target.value));
            handleChange();
          }}
        />
        <input
          type="range"
          min="0"
          max="100"
          value={roiMax}
          onChange={(e) => {
            setRoiMax(parseInt(e.target.value));
            handleChange();
          }}
        />
        <span>
          {roiMin} - {roiMax}
        </span>
      </div>
    </div>
  );
};

/**
 * 主仪表板组件
 */
export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({
  keywords,
  difficultyStats,
  competitorHeatmap,
}) => {
  const [filters, setFilters] = useState({
    difficultyMin: 0,
    difficultyMax: 100,
    roiMin: 0,
    roiMax: 100,
  });

  // 应用筛选
  const filteredKeywords = useMemo(() => {
    return keywords.filter((kw) => {
      const difficulty = kw.difficulty || 0;
      const roi = kw.roi_score || 0;
      return (
        difficulty >= filters.difficultyMin &&
        difficulty <= filters.difficultyMax &&
        roi >= filters.roiMin &&
        roi <= filters.roiMax
      );
    });
  }, [keywords, filters]);

  // 结果表格
  const columns: ColumnDef<KeywordInsight>[] = [
    {
      accessorKey: "normalized_keyword",
      header: "关键词",
      cell: (info) => (
        <strong>{(info.getValue() as string).substring(0, 40)}</strong>
      ),
    },
    {
      accessorKey: "source",
      header: "来源",
      cell: (info) => (
        <span className="badge badge-info">
          {(info.getValue() as string).toUpperCase()}
        </span>
      ),
    },
    {
      accessorKey: "intent",
      header: "意图",
      cell: (info) => <small>{info.getValue() as string}</small>,
    },
    {
      accessorKey: "difficulty",
      header: "难度",
      cell: (info) => {
        const diff = info.getValue() as number;
        let color = "#4caf50";
        if (diff > 50) color = "#ff9800";
        if (diff > 80) color = "#f44336";
        return <span style={{ color }}>{Math.round(diff)}</span>;
      },
    },
    {
      accessorKey: "roi_score",
      header: "ROI",
      cell: (info) => (
        <strong>{Math.round((info.getValue() as number) || 0)}</strong>
      ),
    },
  ];

  const table = useReactTable({
    data: filteredKeywords,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  // 当筛选器改变时重置分页
  React.useEffect(() => {
    table?.setPageIndex?.(0);
  }, [filters, table]);

  return (
    <div className="insights-dashboard">
      <h2>智能洞察</h2>

      {/* 仪表板卡片 */}
      <div className="dashboard-grid">
        <div className="card">
          {difficultyStats && (
            <DifficultyHistogram distribution={difficultyStats.distribution} />
          )}
        </div>

        <div className="card">
          <ROIRankingTable keywords={keywords} />
        </div>

        <div className="card">
          <CompetitorHeatmap competitorData={competitorHeatmap} />
        </div>
      </div>

      {/* 筛选和结果 */}
      <div className="insights-section">
        <InsightsFilter onFilterChange={setFilters} />

        <div className="results-table">
          <h3>
            筛选结果 ({filteredKeywords.length}/{keywords.length})
          </h3>
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

          {/* 分页 */}
          <div className="pagination">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="button button-small"
            >
              ← 上一页
            </button>
            <span>
              第 {table.getState().pagination.pageIndex + 1} 页，共{" "}
              {table.getPageCount()} 页
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="button button-small"
            >
              下一页 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsDashboard;
