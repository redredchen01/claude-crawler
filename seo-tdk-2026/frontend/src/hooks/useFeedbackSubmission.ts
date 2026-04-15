/**
 * useFeedbackSubmission Hook
 *
 * Manages user feedback submission for TDK recommendations
 */

import { useState, useCallback } from "react";

/**
 * Feedback submission state
 */
export interface FeedbackSubmissionState {
  isSubmitting: boolean;
  isSubmitted: boolean;
  error: string | null;
}

/**
 * Feedback input data
 */
export interface FeedbackInput {
  type: "positive" | "negative";
  feedbackText?: string;
  serpSnapshot?: Record<string, any>;
}

/**
 * Hook for feedback submission
 *
 * @param clusterId - The cluster ID for the feedback
 * @param projectId - The project ID for the feedback
 * @returns State and mutation function
 */
export function useFeedbackSubmission(
  clusterId: string,
  projectId: string,
  userId: string = typeof window !== "undefined"
    ? localStorage.getItem("userId") || "guest"
    : "guest",
) {
  const [state, setState] = useState<FeedbackSubmissionState>({
    isSubmitting: false,
    isSubmitted: false,
    error: null,
  });

  const submitFeedback = useCallback(
    async (feedback: FeedbackInput) => {
      // Prevent duplicate submission
      if (state.isSubmitted || state.isSubmitting) {
        return;
      }

      setState({
        isSubmitting: true,
        isSubmitted: false,
        error: null,
      });

      try {
        const response = await fetch(
          `/api/projects/${projectId}/clusters/${clusterId}/feedback`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify(feedback),
          },
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "Failed to submit feedback");
        }

        setState({
          isSubmitting: false,
          isSubmitted: true,
          error: null,
        });
      } catch (error) {
        setState({
          isSubmitting: false,
          isSubmitted: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [clusterId, projectId, state.isSubmitted, state.isSubmitting],
  );

  const reset = useCallback(() => {
    setState({
      isSubmitting: false,
      isSubmitted: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    submitFeedback,
    reset,
  };
}
