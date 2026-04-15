import Anthropic from "@anthropic-ai/sdk";
import { PQSScore, OptimizationResult, FullOptimizationResult } from "./types";
import {
  buildScoringPrompt,
  buildOptimizationPrompt,
  extractJsonFromResponse,
} from "./prompts";
import logger from "../logger";

// Initialize client only if API key is available
const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  : null;

// Mock implementation for development (no API key required)
function generateMockScore(prompt: string): PQSScore {
  const length = prompt.length;
  const hasContext =
    prompt.toLowerCase().includes("context") ||
    prompt.toLowerCase().includes("background");
  const hasExamples =
    prompt.toLowerCase().includes("example") ||
    prompt.toLowerCase().includes("output");
  const hasConstraints =
    prompt.toLowerCase().includes("not") ||
    prompt.toLowerCase().includes("avoid");

  const specificity = Math.min(
    100,
    35 +
      (hasExamples ? 25 : 0) +
      (hasConstraints ? 15 : 0) +
      Math.random() * 10,
  );
  const context = Math.min(
    100,
    40 + (hasContext ? 30 : 0) + (length > 100 ? 10 : 0) + Math.random() * 10,
  );
  const output_spec = Math.min(
    100,
    45 +
      (hasExamples ? 30 : 0) +
      (hasConstraints ? 10 : 0) +
      Math.random() * 10,
  );
  const runnability = Math.min(
    100,
    50 +
      (hasConstraints ? 20 : 0) +
      (hasExamples ? 15 : 0) +
      Math.random() * 10,
  );
  const evaluation = Math.min(
    100,
    40 +
      (hasConstraints ? 25 : 0) +
      (hasExamples ? 15 : 0) +
      Math.random() * 10,
  );
  const safety = Math.min(
    100,
    60 + (hasConstraints ? 20 : 0) + Math.random() * 10,
  );

  const total = Math.round(
    (specificity + context + output_spec + runnability + evaluation + safety) /
      6,
  );

  const missingSlots = [];
  if (!hasContext) missingSlots.push("context");
  if (!hasExamples) missingSlots.push("examples");
  if (!hasConstraints) missingSlots.push("constraints");

  return {
    total,
    dimensions: {
      specificity: Math.round(specificity),
      context: Math.round(context),
      output_spec: Math.round(output_spec),
      runnability: Math.round(runnability),
      evaluation: Math.round(evaluation),
      safety: Math.round(safety),
    },
    missing_slots: missingSlots,
    issues:
      missingSlots.length > 0 ? `Missing: ${missingSlots.join(", ")}` : "None",
    diagnostics: `Prompt length: ${length} chars. Analysis: context=${hasContext}, examples=${hasExamples}, constraints=${hasConstraints}`,
  };
}

function generateMockOptimization(prompt: string): FullOptimizationResult {
  const suggestions = [];

  if (!prompt.toLowerCase().includes("context")) {
    suggestions.push(
      "Add background context to help the AI understand your request better",
    );
  }
  if (!prompt.toLowerCase().includes("example")) {
    suggestions.push("Include examples of expected output format or style");
  }
  if (prompt.length < 50) {
    suggestions.push(
      "Expand the prompt with more specific details about what you want",
    );
  }
  if (
    !prompt.toLowerCase().includes("step") &&
    !prompt.toLowerCase().includes("how")
  ) {
    suggestions.push("Request step-by-step reasoning or a specific approach");
  }

  const optimized =
    prompt +
    (suggestions.length > 0
      ? `\n\nAdditional guidance: ${suggestions.slice(0, 2).join("; ")}`
      : "\n\nThis prompt is already well-structured.");

  const rawScore = generateMockScore(prompt);
  const optimizedScore = generateMockScore(optimized);

  return {
    optimized_prompt: optimized,
    explanation:
      suggestions.slice(0, 2).join(" ") || "Prompt is already well-optimized",
    raw_score: rawScore,
    optimized_score: optimizedScore,
    score_delta: {
      total_delta: optimizedScore.total - rawScore.total,
      dimension_deltas: {
        specificity:
          optimizedScore.dimensions.specificity -
          rawScore.dimensions.specificity,
        context:
          optimizedScore.dimensions.context - rawScore.dimensions.context,
        output_spec:
          optimizedScore.dimensions.output_spec -
          rawScore.dimensions.output_spec,
        runnability:
          optimizedScore.dimensions.runnability -
          rawScore.dimensions.runnability,
        evaluation:
          optimizedScore.dimensions.evaluation - rawScore.dimensions.evaluation,
        safety: optimizedScore.dimensions.safety - rawScore.dimensions.safety,
      },
    },
  };
}

function parseRetryAfter(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;

  // Try to parse as seconds
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try to parse as HTTP-date
  const date = new Date(retryAfterHeader);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return Math.max(0, delayMs);
  }

  return null;
}

function isRateLimitError(error: any): boolean {
  // Primary indicator: status 429 (Too Many Requests)
  if (error?.status === 429) {
    return true;
  }

  // Check for rate limit indicators in response headers
  const headers = error?.response?.headers || {};
  const rateLimitRemaining = headers["ratelimit-remaining"];
  if (rateLimitRemaining === "0") {
    return true;
  }

  // Check for Retry-After header (indicates rate limit)
  if (headers["retry-after"]) {
    return true;
  }

  return false;
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Retry on rate limit errors
      if (isRateLimitError(error) && i < maxRetries - 1) {
        let delayMs: number;

        // Check for Retry-After header first
        const retryAfterHeader = error?.response?.headers?.["retry-after"];
        const parsedRetryAfter = parseRetryAfter(retryAfterHeader);
        if (parsedRetryAfter !== null) {
          delayMs = parsedRetryAfter;
        } else {
          // Check for RateLimit-Reset header
          const rateLimitReset = error?.response?.headers?.["ratelimit-reset"];
          if (rateLimitReset) {
            const resetTime = parseInt(rateLimitReset, 10);
            if (!isNaN(resetTime)) {
              delayMs = Math.max(0, resetTime * 1000 - Date.now());
            } else {
              // Use exponential backoff with jitter
              const base = Math.pow(2, i) * 1000;
              const maxDelay = Math.min(base * 2, 30000);
              const jitter = maxDelay * (0.8 + Math.random() * 0.4);
              delayMs = Math.min(jitter, 30000);
            }
          } else {
            // Use exponential backoff with jitter
            const base = Math.pow(2, i) * 1000;
            const maxDelay = Math.min(base * 2, 30000);
            const jitter = maxDelay * (0.8 + Math.random() * 0.4);
            delayMs = Math.min(jitter, 30000);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      // For non-rate-limit errors, fail immediately
      throw error;
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

export async function scorePrompt(
  rawPrompt: string,
  timeoutMs: number = 30000,
): Promise<PQSScore> {
  if (!rawPrompt || rawPrompt.trim().length === 0) {
    throw new Error("Raw prompt cannot be empty");
  }
  if (rawPrompt.length > 50000) {
    throw new Error("Prompt exceeds maximum length of 50000 characters");
  }

  // Use mock implementation if no API key
  if (!client) {
    return generateMockScore(rawPrompt);
  }

  const start = Date.now();
  const model = "claude-3-5-sonnet-20241022";
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `LLM call timeout after ${timeoutMs}ms for scoring operation`,
          ),
        );
      }, timeoutMs);
    });

    const score = await Promise.race([
      callWithRetry(async () => {
        const message = await client!.messages.create({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: buildScoringPrompt(rawPrompt),
            },
          ],
        });

        const content = message.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response type from Claude");
        }

        const score = extractJsonFromResponse(content.text) as PQSScore;

        // Validate structure
        if (typeof score.total !== "number" || !score.dimensions) {
          throw new Error("Invalid PQSScore structure from Claude");
        }

        return score;
      }),
      timeoutPromise,
    ]);

    const duration = Date.now() - start;
    logger.info(
      { model, duration_ms: duration, operation: "score" },
      "llm call success",
    );

    return score;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(
      {
        model,
        duration_ms: duration,
        error: error.message,
        stack: error.stack,
        operation: "score",
      },
      "llm call failed",
    );
    throw error;
  }
}

export async function optimizePrompt(
  rawPrompt: string,
  timeoutMs: number = 30000,
): Promise<OptimizationResult> {
  if (!rawPrompt || rawPrompt.trim().length === 0) {
    throw new Error("Raw prompt cannot be empty");
  }

  // Use mock implementation if no API key
  if (!client) {
    const mockFull = generateMockOptimization(rawPrompt);
    return {
      optimized_prompt: mockFull.optimized_prompt,
      explanation: mockFull.explanation,
    };
  }

  const start = Date.now();
  const model = "claude-3-5-sonnet-20241022";
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `LLM call timeout after ${timeoutMs}ms for optimization operation`,
          ),
        );
      }, timeoutMs);
    });

    const result = await Promise.race([
      callWithRetry(async () => {
        const message = await client!.messages.create({
          model,
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: buildOptimizationPrompt(rawPrompt),
            },
          ],
        });

        const content = message.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response type from Claude");
        }

        const result = extractJsonFromResponse(
          content.text,
        ) as OptimizationResult;

        // Validate structure
        if (
          typeof result.optimized_prompt !== "string" ||
          typeof result.explanation !== "string"
        ) {
          throw new Error("Invalid OptimizationResult structure from Claude");
        }

        return result;
      }),
      timeoutPromise,
    ]);

    const duration = Date.now() - start;
    logger.info(
      { model, duration_ms: duration, operation: "optimize" },
      "llm call success",
    );

    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error(
      {
        model,
        duration_ms: duration,
        error: error.message,
        stack: error.stack,
        operation: "optimize",
      },
      "llm call failed",
    );
    throw error;
  }
}
