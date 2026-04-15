"use client";

import { useReducer, useCallback } from "react";
import { scorePrompt, optimizeAndScore, getDemo } from "@/lib/api-client";
import { PQSScore } from "@/lib/llm/types";
import ScoreDisplay from "./components/ScoreDisplay";
import OptimizationResult from "./components/OptimizationResult";
import LoadingSpinner from "./components/LoadingSpinner";

interface UIState {
  rawPrompt: string;
  rawScore: PQSScore | null;
  optimizedPrompt: string;
  optimizedScore: PQSScore | null;
  explanation: string;
  isLoading: boolean;
  error: string;
  showScoring: boolean;
  showOptimization: boolean;
}

type UIAction =
  | { type: "SET_RAW_PROMPT"; payload: string }
  | { type: "SET_RAW_SCORE"; payload: PQSScore | null }
  | { type: "SET_OPTIMIZED_PROMPT"; payload: string }
  | { type: "SET_OPTIMIZED_SCORE"; payload: PQSScore | null }
  | { type: "SET_EXPLANATION"; payload: string }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_SHOW_SCORING"; payload: boolean }
  | { type: "SET_SHOW_OPTIMIZATION"; payload: boolean }
  | { type: "LOAD_DEMO"; payload: UIState };

const initialState: UIState = {
  rawPrompt: "",
  rawScore: null,
  optimizedPrompt: "",
  optimizedScore: null,
  explanation: "",
  isLoading: false,
  error: "",
  showScoring: false,
  showOptimization: false,
};

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_RAW_PROMPT":
      return { ...state, rawPrompt: action.payload };
    case "SET_RAW_SCORE":
      return { ...state, rawScore: action.payload };
    case "SET_OPTIMIZED_PROMPT":
      return { ...state, optimizedPrompt: action.payload };
    case "SET_OPTIMIZED_SCORE":
      return { ...state, optimizedScore: action.payload };
    case "SET_EXPLANATION":
      return { ...state, explanation: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SHOW_SCORING":
      return { ...state, showScoring: action.payload };
    case "SET_SHOW_OPTIMIZATION":
      return { ...state, showOptimization: action.payload };
    case "LOAD_DEMO":
      return action.payload;
    default:
      return state;
  }
}

export default function Home() {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  const handleScore = async () => {
    if (!state.rawPrompt.trim()) {
      dispatch({ type: "SET_ERROR", payload: "Please enter a prompt" });
      return;
    }
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_SHOW_SCORING", payload: true });
    try {
      const score = await scorePrompt(state.rawPrompt);
      dispatch({ type: "SET_RAW_SCORE", payload: score });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Failed to score prompt",
      });
      dispatch({ type: "SET_SHOW_SCORING", payload: false });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const handleOptimize = async () => {
    if (!state.rawPrompt.trim()) {
      dispatch({ type: "SET_ERROR", payload: "Please enter a prompt" });
      return;
    }
    dispatch({ type: "SET_ERROR", payload: "" });
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_SHOW_OPTIMIZATION", payload: true });
    try {
      const result = await optimizeAndScore(state.rawPrompt);
      dispatch({
        type: "SET_OPTIMIZED_PROMPT",
        payload: result.optimized_prompt,
      });
      dispatch({
        type: "SET_OPTIMIZED_SCORE",
        payload: result.optimized_score,
      });
      dispatch({ type: "SET_EXPLANATION", payload: result.explanation });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Failed to optimize prompt",
      });
      dispatch({ type: "SET_SHOW_OPTIMIZATION", payload: false });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const handleLoadDemo = async () => {
    dispatch({ type: "SET_ERROR", payload: "" });
    try {
      const demo = await getDemo();
      dispatch({
        type: "LOAD_DEMO",
        payload: {
          rawPrompt: demo.raw_prompt,
          rawScore: demo.raw_score,
          optimizedPrompt: demo.optimized_prompt,
          optimizedScore: demo.optimized_score,
          explanation: demo.optimization_explanation,
          isLoading: false,
          error: "",
          showScoring: true,
          showOptimization: true,
        },
      });
    } catch (err: any) {
      dispatch({
        type: "SET_ERROR",
        payload: err.message || "Failed to load demo",
      });
    }
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(state.optimizedPrompt);
    alert("Optimized prompt copied to clipboard!");
  }, [state.optimizedPrompt]);

  return (
    <main>
      <h1>🎯 Prompt Optimizer</h1>
      <p>Improve your prompts before sending to AI agents</p>

      {state.error && <div className="error">⚠️ {state.error}</div>}

      <div style={{ marginBottom: "2rem" }}>
        <label htmlFor="prompt">
          <strong>Enter your prompt:</strong>
        </label>
        <textarea
          id="prompt"
          value={state.rawPrompt}
          onChange={(e) =>
            dispatch({ type: "SET_RAW_PROMPT", payload: e.target.value })
          }
          placeholder="Type or paste your prompt here..."
          rows={6}
          style={{ marginTop: "0.5rem", marginBottom: "1rem" }}
        />

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={handleScore}
            disabled={state.isLoading || !state.rawPrompt.trim()}
          >
            {state.isLoading && state.showScoring
              ? "⏳ Scoring..."
              : "📊 Score"}
          </button>
          <button
            onClick={handleOptimize}
            disabled={state.isLoading || !state.rawPrompt.trim()}
          >
            {state.isLoading && state.showOptimization
              ? "⏳ Optimizing..."
              : "✨ Optimize"}
          </button>
          <button
            onClick={handleLoadDemo}
            disabled={state.isLoading}
            style={{ background: "#666" }}
          >
            📋 Load Demo
          </button>
        </div>
      </div>

      {state.showScoring && state.rawScore && (
        <div
          style={{
            marginBottom: "2rem",
            padding: "2rem",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
          }}
        >
          <h2>Raw Prompt Score</h2>
          <ScoreDisplay score={state.rawScore!} />
        </div>
      )}

      {state.showOptimization && (
        <OptimizationResult
          rawPrompt={state.rawPrompt}
          rawScore={state.rawScore}
          optimizedPrompt={state.optimizedPrompt}
          optimizedScore={state.optimizedScore}
          explanation={state.explanation}
          isLoading={state.isLoading && state.showOptimization}
          onCopy={handleCopy}
        />
      )}
    </main>
  );
}
