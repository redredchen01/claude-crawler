import { NextResponse } from "next/server";
import logger from "@/lib/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export function formatRateLimitHeaders(
  rateLimit: RateLimitResult,
): Record<string, string> {
  const resetAtSeconds = Math.ceil(rateLimit.resetAt.getTime() / 1000);
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
  );

  return {
    "X-RateLimit-Limit": rateLimit.limit.toString(),
    "X-RateLimit-Remaining": Math.max(0, rateLimit.remaining - 1).toString(),
    "X-RateLimit-Reset": resetAtSeconds.toString(),
    "Retry-After": retryAfterSeconds.toString(),
  };
}

export function buildRateLimitErrorResponse(
  rateLimit: RateLimitResult,
  route: string,
  userId: string,
  requestId: string,
): NextResponse {
  logger.warn({
    route,
    userId,
    request_id: requestId,
    status: 429,
    error: "Rate limit exceeded",
  });

  const response = NextResponse.json(
    { error: "Rate limit exceeded. Try again later." },
    { status: 429 },
  );

  const headers = formatRateLimitHeaders(rateLimit);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePromptInput(
  raw_prompt: unknown,
  maxLength: number = 50000,
): ValidationResult {
  if (!raw_prompt || typeof raw_prompt !== "string") {
    return {
      valid: false,
      error: "Missing or invalid raw_prompt",
    };
  }

  if (raw_prompt.trim().length === 0) {
    return {
      valid: false,
      error: "Prompt cannot be empty or whitespace only",
    };
  }

  if (raw_prompt.length > maxLength) {
    return {
      valid: false,
      error: `Prompt exceeds maximum length of ${maxLength} characters`,
    };
  }

  return { valid: true };
}

export function buildErrorResponse(
  error: any,
  route: string,
  requestId: string,
  duration: number,
  userId?: string,
  defaultMessage: string = "Internal server error",
): NextResponse {
  const status = error?.name === "UnauthorizedError" ? 401 : 500;
  const errorMessage = error?.message || defaultMessage;

  logger.error({
    route,
    userId,
    request_id: requestId,
    duration_ms: duration,
    status,
    error: errorMessage,
  });

  return NextResponse.json(
    { error: errorMessage || defaultMessage },
    { status },
  );
}
