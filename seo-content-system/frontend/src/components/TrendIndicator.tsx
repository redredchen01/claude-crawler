/**
 * TrendIndicator Component
 * Phase 4.2: Visual trend badge with directional arrow
 */

import React from "react";

export type TrendLabel =
  | "rising"
  | "declining"
  | "seasonal"
  | "stable"
  | "unknown";

interface TrendIndicatorProps {
  label?: TrendLabel;
  confidence?: number; // 0-1, used for opacity
  direction?: number; // -1 to 1, selects arrow glyph
  showConfidence?: boolean;
}

// Arrow glyphs selected by direction value
function directionArrow(direction?: number): string {
  if (direction === undefined) return "";
  if (direction > 0.15) return " ↑";
  if (direction < -0.15) return " ↓";
  return " →";
}

// Map label to CSS class suffix
const LABEL_CLASS: Record<TrendLabel, string> = {
  rising: "trend-rising",
  seasonal: "trend-seasonal",
  stable: "trend-stable",
  declining: "trend-declining",
  unknown: "trend-unknown",
};

export const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  label = "unknown",
  confidence,
  direction,
  showConfidence = false,
}) => {
  const cssClass = LABEL_CLASS[label] ?? "trend-unknown";
  const arrow = directionArrow(direction);
  const dimStyle =
    confidence !== undefined ? { opacity: 0.4 + confidence * 0.6 } : undefined;

  return (
    <span
      className={`badge ${cssClass}`}
      style={dimStyle}
      title={
        confidence !== undefined
          ? `Confidence: ${(confidence * 100).toFixed(0)}%`
          : undefined
      }
    >
      {label}
      {arrow}
      {showConfidence && confidence !== undefined && (
        <span className="trend-confidence-label">
          {" "}
          {(confidence * 100).toFixed(0)}%
        </span>
      )}
    </span>
  );
};

export default TrendIndicator;
