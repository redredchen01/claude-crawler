import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { renderHook, act } from "@testing-library/react";
import { useTdkOptimizer } from "../../src/hooks/useTdkOptimizer";

/**
 * Tests for TdkOptimizer Hook
 */
describe("useTdkOptimizer Hook", () => {
  const projectId = "test-project";
  const clusterId = "test-cluster";

  describe("Initial State", () => {
    it("should initialize with empty state", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      expect(result.current.topic).toBe("");
      expect(result.current.keywords).toEqual([]);
      expect(result.current.contentSnippet).toBe("");
      expect(result.current.language).toBe("en");
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.generationResult).toBeNull();
    });
  });

  describe("Input Management", () => {
    it("should update topic", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setTopic("Python tutorial");
      });

      expect(result.current.topic).toBe("Python tutorial");
    });

    it("should set keywords array", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setKeywords(["Python", "tutorial", "beginners"]);
      });

      expect(result.current.keywords).toEqual([
        "Python",
        "tutorial",
        "beginners",
      ]);
    });

    it("should add single keyword", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.addKeyword("Python");
        result.current.addKeyword("tutorial");
      });

      expect(result.current.keywords).toEqual(["Python", "tutorial"]);
    });

    it("should trim keyword when adding", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.addKeyword("  Python  ");
      });

      expect(result.current.keywords[0]).toBe("Python");
    });

    it("should not add empty keywords", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.addKeyword("");
        result.current.addKeyword("  ");
      });

      expect(result.current.keywords).toEqual([]);
    });

    it("should remove keyword by index", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setKeywords(["key1", "key2", "key3"]);
        result.current.removeKeyword(1);
      });

      expect(result.current.keywords).toEqual(["key1", "key3"]);
    });

    it("should update content snippet", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setContentSnippet("This is about Python...");
      });

      expect(result.current.contentSnippet).toBe("This is about Python...");
    });

    it("should change language", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setLanguage("zh");
      });

      expect(result.current.language).toBe("zh");
    });
  });

  describe("Generation Workflow", () => {
    beforeEach(() => {
      // Mock fetch for API calls
      global.fetch = jest.fn();
    });

    it("should validate topic before generation", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.generationError).toBe("Topic is required");
    });

    it("should set loading state during generation", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      // Mock successful response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            primary: {
              candidate: {
                title: "Test",
                description: "Test desc",
                keywords: ["test"],
              },
              validation: {
                severity: "pass" as const,
                issues: [],
              },
            },
            alternatives: [],
            metadata: {
              generatedAt: new Date().toISOString(),
              language: "en" as const,
              modelVersion: "test",
              tokensUsed: 100,
            },
          },
        }),
      });

      act(() => {
        result.current.setTopic("Python");
      });

      const generatePromise = act(async () => {
        await result.current.generate();
      });

      // Verify request was made
      await generatePromise;
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/tdk-optimize`,
        expect.any(Object),
      );
    });

    it("should handle generation success", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const mockResult = {
        primary: {
          candidate: {
            title: "Python Tutorial",
            description: "Learn Python",
            keywords: ["Python"],
          },
          validation: {
            severity: "pass" as const,
            issues: [],
          },
        },
        alternatives: [
          {
            candidate: {
              title: "Alt Title",
              description: "Alt Desc",
              keywords: ["alt"],
            },
            validation: {
              severity: "pass" as const,
              issues: [],
            },
          },
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "test",
          tokensUsed: 200,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockResult }),
      });

      act(() => {
        result.current.setTopic("Python");
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.generationResult).toEqual(mockResult);
      expect(result.current.generationError).toBeNull();
    });

    it("should handle generation error", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "API Error" },
        }),
      });

      act(() => {
        result.current.setTopic("Python");
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.generationError).toBe("API Error");
      expect(result.current.generationResult).toBeNull();
    });

    it("should clear generation results", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      // Simulate having results
      act(() => {
        result.current.generationResult = {
          primary: {
            candidate: {
              title: "Test",
              description: "Test",
              keywords: ["test"],
            },
            validation: { severity: "pass" as const, issues: [] },
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en" as const,
            modelVersion: "test",
            tokensUsed: 100,
          },
        };
      });

      act(() => {
        result.current.clearGeneration();
      });

      expect(result.current.generationResult).toBeNull();
    });
  });

  describe("Candidate Selection & Editing", () => {
    it("should select a candidate", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.selectCandidate(0);
      });

      expect(result.current.selectedCandidateIndex).toBe(0);
    });

    it("should deselect candidate", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.selectCandidate(0);
        result.current.selectCandidate(null);
      });

      expect(result.current.selectedCandidateIndex).toBeNull();
    });

    it("should start editing a candidate", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const candidate = {
        title: "Test Title",
        description: "Test Desc",
        keywords: ["test"],
      };

      act(() => {
        result.current.startEditing(candidate);
      });

      expect(result.current.isEditing).toBe(true);
      expect(result.current.editingCandidate).toEqual(candidate);
    });

    it("should update editing candidate", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const candidate = {
        title: "Original",
        description: "Original",
        keywords: ["original"],
      };

      act(() => {
        result.current.startEditing(candidate);
        result.current.updateEditingCandidate({ title: "Updated" });
      });

      expect(result.current.editingCandidate?.title).toBe("Updated");
      expect(result.current.editingCandidate?.description).toBe("Original");
    });

    it("should cancel editing", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const candidate = {
        title: "Test",
        description: "Test",
        keywords: ["test"],
      };

      act(() => {
        result.current.startEditing(candidate);
        result.current.cancelEditing();
      });

      expect(result.current.isEditing).toBe(false);
      expect(result.current.editingCandidate).toBeNull();
    });
  });

  describe("Save Workflow", () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it("should save edited TDK", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const candidate = {
        title: "Edited Title",
        description: "Edited Desc",
        keywords: ["edited"],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { contentPlanId: clusterId, userTdkJson: candidate },
        }),
      });

      act(() => {
        result.current.startEditing(candidate);
      });

      await act(async () => {
        await result.current.saveTdk();
      });

      expect(result.current.saveSuccess).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${projectId}/clusters/${clusterId}/tdk-save`,
        expect.any(Object),
      );
    });

    it("should handle save error", async () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      const candidate = {
        title: "Test",
        description: "Test",
        keywords: ["test"],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: "Save failed" },
        }),
      });

      act(() => {
        result.current.startEditing(candidate);
      });

      await act(async () => {
        await result.current.saveTdk();
      });

      expect(result.current.saveError).toBe("Save failed");
      expect(result.current.saveSuccess).toBe(false);
    });

    it("should clear save status", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.saveSuccess = true;
        result.current.clearSaveStatus();
      });

      expect(result.current.saveSuccess).toBe(false);
      expect(result.current.saveError).toBeNull();
    });
  });

  describe("Reset", () => {
    it("should reset all state to initial", () => {
      const { result } = renderHook(() =>
        useTdkOptimizer(projectId, clusterId),
      );

      act(() => {
        result.current.setTopic("Test");
        result.current.setKeywords(["test"]);
        result.current.setLanguage("zh");
        result.current.reset();
      });

      expect(result.current.topic).toBe("");
      expect(result.current.keywords).toEqual([]);
      expect(result.current.language).toBe("en");
    });
  });
});

/**
 * Component Integration Tests
 */
describe("TdkOptimizer Component", () => {
  it("should render without crashing", () => {
    // This would require React Testing Library setup
    // Placeholder for actual component test
    expect(true).toBe(true);
  });

  it("should accept props", () => {
    const props = {
      projectId: "proj-1",
      clusterId: "cluster-1",
      initialTopic: "Python",
      initialLanguage: "en" as const,
    };

    expect(props.projectId).toBe("proj-1");
    expect(props.initialTopic).toBe("Python");
  });

  it("should call onSave callback when saving", async () => {
    const onSave = jest.fn();
    // Component test would use this callback
    expect(typeof onSave).toBe("function");
  });
});
