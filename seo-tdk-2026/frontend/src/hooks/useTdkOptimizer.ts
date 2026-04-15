/**
 * useTdkOptimizer Hook
 *
 * Custom hook for TDK generation and validation
 * Manages state and API communication for TdkOptimizer component
 */

import { useState, useCallback } from "react";

/**
 * TDK candidate
 */
export interface TdkCandidate {
  title: string;
  description: string;
  keywords: string[];
}

/**
 * Validation report for a candidate
 */
export interface ValidationReport {
  severity: "pass" | "warn" | "fail";
  issues: Array<{
    field: "title" | "description" | "keywords" | "consistency";
    severity: "info" | "warn" | "fail";
    message: string;
    suggestion?: string;
  }>;
}

/**
 * Single candidate with validation
 */
export interface TdkCandidateWithValidation {
  candidate: TdkCandidate;
  validation: ValidationReport;
}

/**
 * Generation result
 */
export interface TdkGenerationResult {
  primary: TdkCandidateWithValidation;
  alternatives: TdkCandidateWithValidation[];
  metadata: {
    generatedAt: string;
    language: "en" | "zh";
    modelVersion: string;
    tokensUsed: number;
  };
}

/**
 * Hook state
 */
export interface UseTdkOptimizerState {
  // Input state
  topic: string;
  keywords: string[];
  contentSnippet: string;
  language: "en" | "zh";

  // Generation state
  isGenerating: boolean;
  generationError: string | null;
  generationResult: TdkGenerationResult | null;

  // User selection
  selectedCandidateIndex: number | null; // null = no selection, -1 = primary, 0+ = alternative index

  // User edits
  isEditing: boolean;
  editingCandidate: TdkCandidate | null;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
}

/**
 * Hook actions
 */
export interface UseTdkOptimizerActions {
  // Input management
  setTopic: (topic: string) => void;
  setKeywords: (keywords: string[]) => void;
  addKeyword: (keyword: string) => void;
  removeKeyword: (index: number) => void;
  setContentSnippet: (snippet: string) => void;
  setLanguage: (language: "en" | "zh") => void;

  // Generation
  generate: () => Promise<void>;
  clearGeneration: () => void;

  // Selection & editing
  selectCandidate: (index: number | null) => void;
  startEditing: (candidate: TdkCandidate) => void;
  updateEditingCandidate: (updates: Partial<TdkCandidate>) => void;
  cancelEditing: () => void;
  saveTdk: () => Promise<void>;
  clearSaveStatus: () => void;

  // Reset
  reset: () => void;
}

/**
 * Combined hook return type
 */
export type UseTdkOptimizerReturn = UseTdkOptimizerState &
  UseTdkOptimizerActions;

/**
 * Initial state factory
 */
function createInitialState(): UseTdkOptimizerState {
  return {
    topic: "",
    keywords: [],
    contentSnippet: "",
    language: "en",

    isGenerating: false,
    generationError: null,
    generationResult: null,

    selectedCandidateIndex: null,

    isEditing: false,
    editingCandidate: null,
    isSaving: false,
    saveError: null,
    saveSuccess: false,
  };
}

/**
 * Custom hook for TDK optimization workflow
 *
 * @param projectId - Project ID for API calls
 * @param clusterId - Cluster/content plan ID for saving
 * @returns Hook state and actions
 */
export function useTdkOptimizer(
  projectId: string,
  clusterId: string,
  userId: string = typeof window !== "undefined"
    ? localStorage.getItem("userId") || "guest"
    : "guest",
): UseTdkOptimizerReturn {
  const [state, setState] =
    useState<UseTdkOptimizerState>(createInitialState());

  // ===================================================================
  // Input Management Actions
  // ===================================================================

  const setTopic = useCallback((topic: string) => {
    setState((prev) => ({ ...prev, topic }));
  }, []);

  const setKeywords = useCallback((keywords: string[]) => {
    setState((prev) => ({ ...prev, keywords }));
  }, []);

  const addKeyword = useCallback((keyword: string) => {
    if (keyword.trim()) {
      setState((prev) => ({
        ...prev,
        keywords: [...prev.keywords, keyword.trim()],
      }));
    }
  }, []);

  const removeKeyword = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }));
  }, []);

  const setContentSnippet = useCallback((snippet: string) => {
    setState((prev) => ({ ...prev, contentSnippet: snippet }));
  }, []);

  const setLanguage = useCallback((language: "en" | "zh") => {
    setState((prev) => ({ ...prev, language }));
  }, []);

  // ===================================================================
  // Generation Action
  // ===================================================================

  const generate = useCallback(async () => {
    // Validate input
    if (!state.topic.trim()) {
      setState((prev) => ({
        ...prev,
        generationError: "Topic is required",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isGenerating: true,
      generationError: null,
    }));

    try {
      // Call API
      const response = await fetch(
        `/api/projects/${projectId}/clusters/${clusterId}/tdk-optimize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({
            topic: state.topic,
            keywords: state.keywords,
            contentSnippet: state.contentSnippet || undefined,
            language: state.language,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to generate TDK");
      }

      const data = await response.json();

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generationResult: data.data,
        generationError: null,
        selectedCandidateIndex: null, // Reset selection
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generationError: errorMessage,
      }));
    }
  }, [
    projectId,
    clusterId,
    userId,
    state.topic,
    state.keywords,
    state.contentSnippet,
    state.language,
  ]);

  const clearGeneration = useCallback(() => {
    setState((prev) => ({
      ...prev,
      generationResult: null,
      generationError: null,
      selectedCandidateIndex: null,
    }));
  }, []);

  const loadTdk = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/clusters/${clusterId}/tdk`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
        },
      );

      if (!response.ok) {
        // Not found is expected if no TDK has been generated yet
        if (response.status === 404) {
          return;
        }
        throw new Error("Failed to load TDK");
      }

      const data = await response.json();
      if (data.data?.tdkJson) {
        setState((prev) => ({
          ...prev,
          generationResult: data.data.tdkJson,
          editingCandidate: data.data.userTdkJson || null,
        }));
      }
    } catch (error) {
      // Silently fail - TDK may not exist yet
      console.error("Failed to load TDK:", error);
    }
  }, [projectId, clusterId, userId]);

  // ===================================================================
  // Selection & Editing Actions
  // ===================================================================

  const selectCandidate = useCallback((index: number | null) => {
    setState((prev) => ({
      ...prev,
      selectedCandidateIndex: index,
      isEditing: false,
      editingCandidate: null,
    }));
  }, []);

  const startEditing = useCallback((candidate: TdkCandidate) => {
    setState((prev) => ({
      ...prev,
      isEditing: true,
      editingCandidate: { ...candidate },
    }));
  }, []);

  const updateEditingCandidate = useCallback(
    (updates: Partial<TdkCandidate>) => {
      setState((prev) => ({
        ...prev,
        editingCandidate: prev.editingCandidate
          ? { ...prev.editingCandidate, ...updates }
          : null,
      }));
    },
    [],
  );

  const cancelEditing = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isEditing: false,
      editingCandidate: null,
    }));
  }, []);

  // ===================================================================
  // Save Action
  // ===================================================================

  const saveTdk = useCallback(async () => {
    if (!state.editingCandidate) {
      setState((prev) => ({
        ...prev,
        saveError: "No TDK to save",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isSaving: true,
      saveError: null,
      saveSuccess: false,
    }));

    try {
      const response = await fetch(
        `/api/projects/${projectId}/clusters/${clusterId}/tdk-save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({
            userTdkJson: state.editingCandidate,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to save TDK");
      }

      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveSuccess: true,
        isEditing: false,
        editingCandidate: null,
      }));

      // Clear success message after 3 seconds
      setTimeout(() => {
        setState((prev) => ({ ...prev, saveSuccess: false }));
      }, 3000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setState((prev) => ({
        ...prev,
        isSaving: false,
        saveError: errorMessage,
      }));
    }
  }, [projectId, clusterId, userId, state.editingCandidate]);

  const clearSaveStatus = useCallback(() => {
    setState((prev) => ({
      ...prev,
      saveError: null,
      saveSuccess: false,
    }));
  }, []);

  // ===================================================================
  // Reset Action
  // ===================================================================

  const reset = useCallback(() => {
    setState(createInitialState());
  }, []);

  // ===================================================================
  // Return combined state and actions
  // ===================================================================

  return {
    ...state,
    setTopic,
    setKeywords,
    addKeyword,
    removeKeyword,
    setContentSnippet,
    setLanguage,
    generate,
    clearGeneration,
    selectCandidate,
    startEditing,
    updateEditingCandidate,
    cancelEditing,
    saveTdk,
    clearSaveStatus,
    reset,
  };
}
