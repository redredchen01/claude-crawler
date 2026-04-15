import { RealtimeEvent } from "../hooks/useRealtime";

interface JobRealtimeStatusProps {
  jobStatus: string;
  resultCount?: number;
  progress?: number;
  lastEvent?: RealtimeEvent | null;
  isConnected: boolean;
}

export function JobRealtimeStatus({
  jobStatus,
  resultCount = 0,
  progress = 0,
  lastEvent,
  isConnected,
}: JobRealtimeStatusProps) {
  const getStatusBadge = () => {
    switch (jobStatus) {
      case "waiting":
        return <span className="badge badge-warning">⏳ Waiting</span>;
      case "running":
        return <span className="badge badge-info">🔄 Running</span>;
      case "completed":
        return <span className="badge badge-success">✅ Completed</span>;
      case "failed":
        return <span className="badge badge-error">❌ Failed</span>;
      default:
        return <span className="badge">{jobStatus}</span>;
    }
  };

  return (
    <div className="job-realtime-status">
      <div className="status-header">
        <div className="status-title">
          <h3>Job Status</h3>
          {isConnected && (
            <span className="connection-indicator" title="Connected via SSE">
              🟢 Live
            </span>
          )}
        </div>
        <div className="status-badge">{getStatusBadge()}</div>
      </div>

      {(jobStatus === "running" || jobStatus === "waiting") && (
        <div className="progress-section">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress || 0}%` }}
            />
          </div>
          <div className="progress-text">
            {progress ? `${Math.round(progress)}%` : "Starting..."}
          </div>
        </div>
      )}

      <div className="status-details">
        <div className="detail-item">
          <span className="label">Keywords Found:</span>
          <span className="value">{resultCount}</span>
        </div>
        {lastEvent && (
          <div className="detail-item">
            <span className="label">Last Update:</span>
            <span className="value">
              {new Date(lastEvent.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      <style jsx>{`
        .job-realtime-status {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          border-left: 4px solid #3b82f6;
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .status-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-title h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .connection-indicator {
          font-size: 12px;
          padding: 4px 8px;
          background: #e8f5e9;
          border-radius: 4px;
          color: #2e7d32;
          font-weight: 500;
        }

        .badge {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        }

        .badge-waiting {
          background-color: #fff3cd;
          color: #856404;
        }

        .badge-info {
          background-color: #d1ecf1;
          color: #0c5460;
        }

        .badge-success {
          background-color: #d4edda;
          color: #155724;
        }

        .badge-error {
          background-color: #f8d7da;
          color: #721c24;
        }

        .progress-section {
          margin: 16px 0;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #1e40af);
          transition: width 0.3s ease;
        }

        .progress-text {
          text-align: center;
          font-size: 12px;
          color: #666;
          margin-top: 8px;
          font-weight: 500;
        }

        .status-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid #e0e0e0;
        }

        .label {
          font-size: 13px;
          color: #666;
          font-weight: 500;
        }

        .value {
          font-size: 14px;
          color: #333;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
