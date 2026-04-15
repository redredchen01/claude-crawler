/**
 * useTdkStore - Global Zustand Store for TDK Optimization
 *
 * Manages:
 * - Multiple page cache (clusterId → TdkData)
 * - Editing sessions across pages
 * - Multi-page analysis state
 * - Feedback draft state
 */

import { create } from "zustand";
import type { TdkCandidate } from "./useTdkOptimizer";

export interface EditSession {
  clusterId: string;
  startedAt: string;
  changes: Partial<TdkCandidate>;
  isDirty: boolean;
}

export interface PageStats {
  totalPages: number;
  pagesWithTdk: number;
  averageScore: number;
  conflictCount: number;
}

export interface TdkStoreState {
  // Page cache: clusterId → TdkData
  pageCache: Record<
    string,
    {
      data: TdkCandidate;
      generatedAt: string;
      language: "en" | "zh";
    }
  >;

  // Editing sessions
  editingSessions: Record<string, EditSession>;
  currentEditingClusterId: string | null;

  // Multi-page analysis
  multiPageStats: PageStats | null;
  conflictMatrix: Record<string, number>; // clusterId pairs → similarity score

  // Feedback draft
  feedbackDraft: {
    clusterId: string | null;
    type: "positive" | "negative" | null;
    text: string;
  };

  // UI state
  isLoading: boolean;
  error: string | null;
}

export interface TdkStoreActions {
  // Page cache operations
  cacheTdkData: (
    clusterId: string,
    data: TdkCandidate,
    language: "en" | "zh",
  ) => void;
  getCachedTdk: (clusterId: string) => TdkCandidate | null;
  clearCache: () => void;

  // Editing session operations
  startEditingSession: (clusterId: string) => void;
  updateEditingSession: (
    clusterId: string,
    changes: Partial<TdkCandidate>,
  ) => void;
  finishEditingSession: (clusterId: string) => void;
  getEditingSession: (clusterId: string) => EditSession | null;

  // Multi-page state
  setMultiPageStats: (stats: PageStats) => void;
  setConflictMatrix: (matrix: Record<string, number>) => void;

  // Feedback draft
  setFeedbackDraft: (clusterId: string, type: "positive" | "negative") => void;
  updateFeedbackText: (text: string) => void;
  clearFeedbackDraft: () => void;

  // UI state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type UseTdkStoreReturn = TdkStoreState & TdkStoreActions;

const initialState: TdkStoreState = {
  pageCache: {},
  editingSessions: {},
  currentEditingClusterId: null,
  multiPageStats: null,
  conflictMatrix: {},
  feedbackDraft: {
    clusterId: null,
    type: null,
    text: "",
  },
  isLoading: false,
  error: null,
};

export const useTdkStore = create<UseTdkStoreReturn>((set) => ({
  ...initialState,

  // Page cache operations
  cacheTdkData: (clusterId, data, language) =>
    set((state) => ({
      pageCache: {
        ...state.pageCache,
        [clusterId]: {
          data,
          generatedAt: new Date().toISOString(),
          language,
        },
      },
    })),

  getCachedTdk: (clusterId) => {
    const store = useTdkStore.getState();
    return store.pageCache[clusterId]?.data || null;
  },

  clearCache: () =>
    set({
      pageCache: {},
      editingSessions: {},
      currentEditingClusterId: null,
    }),

  // Editing session operations
  startEditingSession: (clusterId) =>
    set((state) => ({
      currentEditingClusterId: clusterId,
      editingSessions: {
        ...state.editingSessions,
        [clusterId]: {
          clusterId,
          startedAt: new Date().toISOString(),
          changes: {},
          isDirty: false,
        },
      },
    })),

  updateEditingSession: (clusterId, changes) =>
    set((state) => {
      const session = state.editingSessions[clusterId];
      if (!session) return state;

      return {
        editingSessions: {
          ...state.editingSessions,
          [clusterId]: {
            ...session,
            changes: { ...session.changes, ...changes },
            isDirty: true,
          },
        },
      };
    }),

  finishEditingSession: (clusterId) =>
    set((state) => {
      const { [clusterId]: _, ...remaining } = state.editingSessions;
      return {
        editingSessions: remaining,
        currentEditingClusterId:
          state.currentEditingClusterId === clusterId
            ? null
            : state.currentEditingClusterId,
      };
    }),

  getEditingSession: (clusterId) => {
    const store = useTdkStore.getState();
    return store.editingSessions[clusterId] || null;
  },

  // Multi-page state
  setMultiPageStats: (stats) => set({ multiPageStats: stats }),

  setConflictMatrix: (matrix) => set({ conflictMatrix: matrix }),

  // Feedback draft
  setFeedbackDraft: (clusterId, type) =>
    set({
      feedbackDraft: {
        clusterId,
        type,
        text: "",
      },
    }),

  updateFeedbackText: (text) =>
    set((state) => ({
      feedbackDraft: {
        ...state.feedbackDraft,
        text,
      },
    })),

  clearFeedbackDraft: () =>
    set({
      feedbackDraft: {
        clusterId: null,
        type: null,
        text: "",
      },
    }),

  // UI state
  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
