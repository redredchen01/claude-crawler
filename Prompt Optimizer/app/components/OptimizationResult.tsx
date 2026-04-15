import { PQSScore } from "@/lib/llm/types";
import LoadingSpinner from "./LoadingSpinner";
import React, { useMemo } from "react";

interface Props {
  rawPrompt: string;
  rawScore: PQSScore | null;
  optimizedPrompt: string;
  optimizedScore: PQSScore | null;
  explanation: string;
  isLoading: boolean;
  onCopy: () => void;
}

function OptimizationResult({
  rawPrompt,
  rawScore,
  optimizedPrompt,
  optimizedScore,
  explanation,
  isLoading,
  onCopy,
}: Props) {
  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <LoadingSpinner />
        <p>Optimizing prompt...</p>
      </div>
    );
  }

  if (!rawScore || !optimizedScore) {
    return null;
  }

  const { totalDelta, deltaClass } = useMemo(() => {
    const delta = optimizedScore.total - rawScore.total;
    return {
      totalDelta: delta,
      deltaClass:
        delta > 0 ? "delta-positive" : delta < 0 ? "delta-negative" : "",
    };
  }, [rawScore, optimizedScore]);

  return (
    <div
      style={{
        marginTop: "2rem",
        padding: "2rem",
        backgroundColor: "#f9f9f9",
        borderRadius: "8px",
      }}
    >
      <h2>Optimization Results</h2>

      <div
        style={{
          marginBottom: "2rem",
          padding: "1rem",
          backgroundColor: "#e8f5e9",
          borderRadius: "4px",
        }}
      >
        <h3>Score Improvement</h3>
        <p>
          Raw: <strong>{rawScore.total}/100</strong> → Optimized:{" "}
          <strong>{optimizedScore.total}/100</strong>
        </p>
        <p className={deltaClass}>
          {totalDelta > 0 ? "+" : ""}
          {totalDelta} points (
          {((totalDelta / rawScore.total) * 100).toFixed(1)}%)
        </p>
      </div>

      <div className="comparison">
        <div className="comparison-item">
          <h3>Original Prompt</h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {rawPrompt}
          </pre>
        </div>
        <div className="comparison-item">
          <h3>Optimized Prompt</h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {optimizedPrompt}
          </pre>
          <button onClick={onCopy} style={{ marginTop: "1rem" }}>
            📋 Copy to Clipboard
          </button>
        </div>
      </div>

      <div style={{ marginTop: "2rem" }}>
        <h3>Optimization Explanation</h3>
        <p>{explanation}</p>
      </div>
    </div>
  );
}

export default React.memo(OptimizationResult);
