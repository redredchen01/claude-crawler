import { useState, useEffect, useRef } from "react";

interface AnalysisStreamingProps {
  jobId: string;
  analysisType: "difficulty_insights" | "roi_opportunities" | "competitor_gaps";
  enabled?: boolean;
  onComplete?: (content: string) => void;
}

export function AnalysisStreaming({
  jobId,
  analysisType,
  enabled = true,
  onComplete,
}: AnalysisStreamingProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef("");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !jobId) return;

    const startStreaming = async () => {
      try {
        setIsLoading(true);
        setError(null);
        contentRef.current = "";
        setContent("");

        const eventSource = new EventSource(
          `http://localhost:3001/api/analysis/${jobId}/${analysisType}`,
        );

        eventSource.addEventListener("start", (event: any) => {
          const data = JSON.parse(event.data);
          contentRef.current = "";
          setContent("");
        });

        eventSource.addEventListener("content", (event: any) => {
          const data = JSON.parse(event.data);
          const chunk = data.chunk || "";
          contentRef.current += chunk;
          setContent(contentRef.current);
        });

        eventSource.addEventListener("complete", (event: any) => {
          eventSource.close();
          setIsLoading(false);
          onComplete?.(contentRef.current);
        });

        eventSource.addEventListener("error", (event: any) => {
          const data = JSON.parse(event.data);
          const errorMsg = data.message || "Analysis failed";
          setError(errorMsg);
          eventSource.close();
          setIsLoading(false);
        });

        eventSource.onerror = () => {
          setError("Connection lost during streaming");
          eventSource.close();
          setIsLoading(false);
        };

        eventSourceRef.current = eventSource;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to start streaming";
        setError(msg);
        setIsLoading(false);
      }
    };

    startStreaming();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [enabled, jobId, analysisType, onComplete]);

  const getAnalysisTitle = () => {
    switch (analysisType) {
      case "difficulty_insights":
        return "📊 Difficulty Insights";
      case "roi_opportunities":
        return "💰 ROI Opportunities";
      case "competitor_gaps":
        return "🎯 Competitor Gaps";
      default:
        return "Analysis";
    }
  };

  return (
    <div className="analysis-streaming">
      <div className="analysis-header">
        <h4>{getAnalysisTitle()}</h4>
        {isLoading && <span className="loading-spinner">⟳</span>}
      </div>

      {error && (
        <div className="analysis-error">
          <span>❌</span> {error}
        </div>
      )}

      <div className="analysis-content">
        {content ? (
          <div className="analysis-text">
            {content.split("\n").map((line, idx) => (
              <p key={idx}>{line || "\u00a0"}</p>
            ))}
            {isLoading && <span className="cursor">|</span>}
          </div>
        ) : isLoading ? (
          <div className="analysis-placeholder">Starting analysis...</div>
        ) : (
          <div className="analysis-placeholder">No analysis yet</div>
        )}
      </div>

      <style jsx>{`
        .analysis-streaming {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .analysis-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid #f0f0f0;
        }

        .analysis-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .loading-spinner {
          font-size: 18px;
          animation: spin 1s linear infinite;
          display: inline-block;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .analysis-error {
          background: #ffebee;
          color: #c62828;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .analysis-content {
          min-height: 60px;
          max-height: 400px;
          overflow-y: auto;
        }

        .analysis-text {
          font-size: 14px;
          line-height: 1.6;
          color: #333;
          font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .analysis-text p {
          margin: 8px 0;
          padding: 0;
        }

        .cursor {
          animation: blink 1s infinite;
          color: #3b82f6;
          font-weight: bold;
        }

        @keyframes blink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }

        .analysis-placeholder {
          text-align: center;
          color: #999;
          padding: 20px;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
