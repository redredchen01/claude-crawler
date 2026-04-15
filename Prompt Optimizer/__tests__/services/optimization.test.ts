import { optimizeAndScoreService } from "@/lib/services/optimization";
import * as llm from "@/lib/llm/client";
import * as scoring from "@/lib/services/scoring";

jest.mock("@/lib/llm/client");
jest.mock("@/lib/services/scoring");

const mockLlm = llm as jest.Mocked<typeof llm>;
const mockScoring = scoring as jest.Mocked<typeof scoring>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Optimization Service", () => {
  const mockRawScore = {
    total: 35,
    dimensions: {
      specificity: 5,
      context: 5,
      output_spec: 5,
      runnability: 5,
      evaluation: 5,
      safety: 5,
    },
    missing_slots: ["language", "format", "constraints"],
    issues: "Lacks specificity and context",
    diagnostics:
      "Please specify the programming language and desired output format",
  };

  const mockOptimizedScore = {
    total: 82,
    dimensions: {
      specificity: 18,
      context: 16,
      output_spec: 18,
      runnability: 14,
      evaluation: 12,
      safety: 9,
    },
    missing_slots: [],
    issues: "None identified",
    diagnostics: "Excellent prompt quality",
  };

  const mockOptimizationResult = {
    optimized_prompt:
      "You are a Python developer. Write clean, well-documented code to process CSV files. " +
      "The code should: 1) Read a CSV file, 2) Parse each row, 3) Validate data, 4) Output as JSON. " +
      "Include error handling and unit tests.",
    explanation:
      "Added specificity (Python), detailed steps, error handling requirements, and testing expectation",
  };

  test("should complete full optimization pipeline", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(mockOptimizedScore);

    const result = await optimizeAndScoreService("Write code");

    // Verify pipeline executed in order
    expect(mockScoring.scorePromptService).toHaveBeenCalledWith("Write code");
    expect(mockLlm.optimizePrompt).toHaveBeenCalledWith("Write code", 30000);
    expect(mockLlm.scorePrompt).toHaveBeenCalledWith(
      mockOptimizationResult.optimized_prompt,
      30000,
    );

    // Verify result structure
    expect(result).toHaveProperty("optimized_prompt");
    expect(result).toHaveProperty("explanation");
    expect(result).toHaveProperty("raw_score");
    expect(result).toHaveProperty("optimized_score");
    expect(result).toHaveProperty("score_delta");
  });

  test("should calculate correct score delta", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(mockOptimizedScore);

    const result = await optimizeAndScoreService("Write code");

    expect(result.score_delta.total_delta).toBe(
      mockOptimizedScore.total - mockRawScore.total,
    );
    expect(result.score_delta.total_delta).toBe(47);

    // Verify dimension deltas
    expect(result.score_delta.dimension_deltas.specificity).toBe(13); // 18 - 5
    expect(result.score_delta.dimension_deltas.context).toBe(11); // 16 - 5
    expect(result.score_delta.dimension_deltas.output_spec).toBe(13); // 18 - 5
    expect(result.score_delta.dimension_deltas.runnability).toBe(9); // 14 - 5
    expect(result.score_delta.dimension_deltas.evaluation).toBe(7); // 12 - 5
    expect(result.score_delta.dimension_deltas.safety).toBe(4); // 9 - 5
  });

  test("should preserve raw and optimized prompts in result", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(mockOptimizedScore);

    const rawPrompt = "Write code to process data";
    const result = await optimizeAndScoreService(rawPrompt);

    expect(result.raw_score).toEqual(mockRawScore);
    expect(result.optimized_prompt).toBe(
      mockOptimizationResult.optimized_prompt,
    );
    expect(result.optimized_score).toEqual(mockOptimizedScore);
    expect(result.explanation).toBe(mockOptimizationResult.explanation);
  });

  test("should throw on empty prompt", async () => {
    await expect(optimizeAndScoreService("")).rejects.toThrow(
      "Prompt cannot be empty",
    );

    expect(mockScoring.scorePromptService).not.toHaveBeenCalled();
    expect(mockLlm.optimizePrompt).not.toHaveBeenCalled();
    expect(mockLlm.scorePrompt).not.toHaveBeenCalled();
  });

  test("should throw on whitespace-only prompt", async () => {
    await expect(optimizeAndScoreService("  \n\t  ")).rejects.toThrow(
      "Prompt cannot be empty",
    );

    expect(mockScoring.scorePromptService).not.toHaveBeenCalled();
  });

  test("should propagate scoring errors", async () => {
    const error = new Error("Scoring service failed");
    mockScoring.scorePromptService.mockRejectedValue(error);

    await expect(optimizeAndScoreService("Write code")).rejects.toThrow(
      "Scoring service failed",
    );

    // Note: optimizePrompt may be called due to Promise.all executing both in parallel
    expect(mockScoring.scorePromptService).toHaveBeenCalled();
  });

  test("should propagate optimization errors", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    const error = new Error("Optimization failed");
    mockLlm.optimizePrompt.mockRejectedValue(error);

    await expect(optimizeAndScoreService("Write code")).rejects.toThrow(
      "Optimization failed",
    );

    expect(mockLlm.scorePrompt).not.toHaveBeenCalled();
  });

  test("should propagate optimized prompt scoring errors", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    const error = new Error("Re-scoring failed");
    mockLlm.scorePrompt.mockRejectedValue(error);

    await expect(optimizeAndScoreService("Write code")).rejects.toThrow(
      "Re-scoring failed",
    );
  });

  test("should handle cases where score gets worse (delta negative)", async () => {
    const worseScore = {
      ...mockOptimizedScore,
      total: 30, // Worse than raw score
    };

    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(worseScore);

    const result = await optimizeAndScoreService("Write code");

    expect(result.score_delta.total_delta).toBe(
      worseScore.total - mockRawScore.total,
    ); // negative
    expect(result.score_delta.total_delta).toBeLessThan(0);
  });

  test("should handle zero improvement scenario", async () => {
    const sameScore = mockRawScore;

    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(sameScore);

    const result = await optimizeAndScoreService("Write code");

    expect(result.score_delta.total_delta).toBe(0);
    expect(result.score_delta.dimension_deltas.specificity).toBe(0);
  });

  test("should include optimization explanation in result", async () => {
    mockScoring.scorePromptService.mockResolvedValue(mockRawScore);
    mockLlm.optimizePrompt.mockResolvedValue(mockOptimizationResult);
    mockLlm.scorePrompt.mockResolvedValue(mockOptimizedScore);

    const result = await optimizeAndScoreService("Write code");

    expect(result.explanation).toBe(mockOptimizationResult.explanation);
    expect(result.explanation).toContain("specificity");
  });
});
