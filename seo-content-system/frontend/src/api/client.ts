/**
 * API Client
 * Frontend HTTP client for backend API communication
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

export interface ApiOptions extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * Make an API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * GET request
 */
export const get = <T,>(endpoint: string, options?: ApiOptions) =>
  apiRequest<T>(endpoint, { ...options, method: "GET" });

/**
 * POST request
 */
export const post = <T,>(endpoint: string, data?: any, options?: ApiOptions) =>
  apiRequest<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });

/**
 * PATCH request
 */
export const patch = <T,>(endpoint: string, data?: any, options?: ApiOptions) =>
  apiRequest<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(data),
  });

/**
 * PUT request
 */
export const put = <T,>(endpoint: string, data?: any, options?: ApiOptions) =>
  apiRequest<T>(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });

/**
 * DELETE request
 */
export const del = <T,>(endpoint: string, options?: ApiOptions) =>
  apiRequest<T>(endpoint, { ...options, method: "DELETE" });
