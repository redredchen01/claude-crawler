import { PQSScore } from "@/lib/llm/types";
import React from "react";

interface Props {
  score: PQSScore;
}

function ScoreDisplay({ score }: Props) {
  return (
    <div>
      <h2>Score: {score.total}/100</h2>
      <div className="score-grid">
        <div className="score-item">
          <strong>Specificity</strong>
          <div className="score-value">{score.dimensions.specificity}/20</div>
        </div>
        <div className="score-item">
          <strong>Context</strong>
          <div className="score-value">{score.dimensions.context}/20</div>
        </div>
        <div className="score-item">
          <strong>Output Spec</strong>
          <div className="score-value">{score.dimensions.output_spec}/20</div>
        </div>
        <div className="score-item">
          <strong>Runnability</strong>
          <div className="score-value">{score.dimensions.runnability}/15</div>
        </div>
        <div className="score-item">
          <strong>Evaluation</strong>
          <div className="score-value">{score.dimensions.evaluation}/15</div>
        </div>
        <div className="score-item">
          <strong>Safety</strong>
          <div className="score-value">{score.dimensions.safety}/10</div>
        </div>
      </div>

      {score.missing_slots.length > 0 && (
        <div>
          <h3>Missing Information:</h3>
          <ul className="slot-list">
            {score.missing_slots.map((slot) => (
              <li key={slot}>{slot}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <h3>Issues:</h3>
        <p>{score.issues}</p>
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          💡 {score.diagnostics}
        </p>
      </div>
    </div>
  );
}

export default React.memo(ScoreDisplay);
