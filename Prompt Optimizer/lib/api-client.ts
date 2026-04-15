import { PQSScore } from "./llm/types";

interface FullOptimizationResponse {
  optimized_prompt: string;
  explanation: string;
  optimized_score: PQSScore;
  score_delta: {
    total_delta: number;
    dimension_deltas: Record<string, number>;
  };
}

export interface DemoResponse {
  raw_prompt: string;
  raw_score: PQSScore;
  optimized_prompt: string;
  optimized_score: PQSScore;
  optimization_explanation: string;
}

export async function scorePrompt(rawPrompt: string): Promise<PQSScore> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_prompt: rawPrompt }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || error.message || "Failed to score prompt");
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function optimizeAndScore(
  rawPrompt: string,
): Promise<FullOptimizationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("/api/optimize-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_prompt: rawPrompt }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.error || error.message || "Failed to optimize prompt",
      );
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDemo(): Promise<DemoResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("/api/demo", {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Failed to fetch demo");
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
