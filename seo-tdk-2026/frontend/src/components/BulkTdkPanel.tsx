/**
 * BulkTdkPanel Component
 *
 * UI for batch TDK generation across multiple content plans
 */

import React, { useState } from "react";
import { useBulkTdkGeneration } from "../hooks/useBulkTdkGeneration";
import "./BulkTdkPanel.css";

export interface BulkTdkPanelProps {
  projectId: string;
  clusterIds: string[];
  onComplete?: () => void;
}

export const BulkTdkPanel: React.FC<BulkTdkPanelProps> = ({
  projectId,
  clusterIds,
  onComplete,
}) => {
  const bulk = useBulkTdkGeneration();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(clusterIds),
  );

  const handleSelectAll = () => {
    if (selectedIds.size === clusterIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clusterIds));
    }
  };

  const handleSelectCluster = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleStartBatch = async () => {
    await bulk.startBatch(Array.from(selectedIds), projectId);
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div className="bulk-tdk-panel">
      <h3 className="panel-title">批量 TDK 生成</h3>

      {/* Selection Section */}
      {!bulk.isRunning && (
        <div className="selection-section">
          <div className="select-all">
            <input
              type="checkbox"
              id="select-all"
              checked={selectedIds.size === clusterIds.length}
              onChange={handleSelectAll}
            />
            <label htmlFor="select-all">
              全選 ({selectedIds.size}/{clusterIds.length})
            </label>
          </div>

          <div className="cluster-list">
            {clusterIds.map((id) => (
              <label key={id} className="cluster-item">
                <input
                  type="checkbox"
                  checked={selectedIds.has(id)}
                  onChange={() => handleSelectCluster(id)}
                />
                <span>{id}</span>
              </label>
            ))}
          </div>

          <button
            className="btn-start"
            onClick={handleStartBatch}
            disabled={selectedIds.size === 0}
          >
            開始生成 ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Progress Section */}
      {bulk.isRunning && (
        <div className="progress-section">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${bulk.progress}%` }}
            />
          </div>

          <div className="progress-stats">
            <span className="stat">
              進度: {bulk.completed}/{bulk.total}
            </span>
            <span className="stat">{bulk.progress}%</span>
            <span className="stat current">
              {bulk.currentClusterId && `處理: ${bulk.currentClusterId}`}
            </span>
          </div>

          <button className="btn-cancel" onClick={() => bulk.cancel()}>
            取消
          </button>
        </div>
      )}

      {/* Results Section */}
      {!bulk.isRunning && bulk.completed > 0 && (
        <div className="results-section">
          <div className="result-summary">
            <span className="result-item success">
              ✓ 成功: {bulk.succeeded.length}
            </span>
            {bulk.failed.length > 0 && (
              <span className="result-item failed">
                ✗ 失敗: {bulk.failed.length}
              </span>
            )}
          </div>

          {bulk.failed.length > 0 && (
            <div className="failed-list">
              <h4>失敗的項目:</h4>
              <ul>
                {bulk.failed.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </div>
          )}

          <button className="btn-reset" onClick={() => bulk.reset()}>
            重置
          </button>
        </div>
      )}

      {bulk.error && (
        <div className="error-message">
          <p>{bulk.error}</p>
        </div>
      )}
    </div>
  );
};
