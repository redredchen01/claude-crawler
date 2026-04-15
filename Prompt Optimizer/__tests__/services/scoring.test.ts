import { scorePromptService } from "@/lib/services/scoring";
import * as llm from "@/lib/llm/client";

jest.mock("@/lib/llm/client");

const mockLlm = llm as jest.Mocked<typeof llm>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Scoring Service", () => {
  const mockScore = {
    total: 45,
    dimensions: {
      specificity: 10,
      context: 8,
      output_spec: 12,
      runnability: 8,
      evaluation: 5,
      safety: 2,
    },
    missing_slots: ["language", "format"],
    issues: "Missing implementation details",
    diagnostics: "Specify what programming language and output format",
  };

  test("should score a valid prompt", async () => {
    mockLlm.scorePrompt.mockResolvedValue(mockScore);

    const result = await scorePromptService("Write code to process data");

    expect(result).toEqual(mockScore);
    expect(result.total).toBe(45);
    expect(result.dimensions.specificity).toBe(10);
    expect(result.missing_slots).toContain("language");
    expect(mockLlm.scorePrompt).toHaveBeenCalledWith(
      "Write code to process data",
    );
  });

  test("should throw on empty prompt", async () => {
    await expect(scorePromptService("")).rejects.toThrow(
      "Prompt cannot be empty",
    );
    expect(mockLlm.scorePrompt).not.toHaveBeenCalled();
  });

  test("should throw on whitespace-only prompt", async () => {
    await expect(scorePromptService("   \n\t  ")).rejects.toThrow(
      "Prompt cannot be empty",
    );
    expect(mockLlm.scorePrompt).not.toHaveBeenCalled();
  });

  test("should propagate LLM errors", async () => {
    const error = new Error("API rate limit exceeded");
    mockLlm.scorePrompt.mockRejectedValue(error);

    await expect(scorePromptService("Write code")).rejects.toThrow(
      "API rate limit exceeded",
    );
  });

  test("should propagate validation errors from LLM", async () => {
    const error = new Error("Invalid PQSScore structure from Claude");
    mockLlm.scorePrompt.mockRejectedValue(error);

    await expect(scorePromptService("Write code")).rejects.toThrow(
      "Invalid PQSScore structure",
    );
  });

  test("should handle network errors gracefully", async () => {
    const error = new Error("Network timeout");
    mockLlm.scorePrompt.mockRejectedValue(error);

    await expect(scorePromptService("Write code")).rejects.toThrow(
      "Network timeout",
    );
  });

  test("should score different prompt types correctly", async () => {
    const longPrompt =
      "Create a comprehensive guide for machine learning best practices..." +
      "a".repeat(200);

    mockLlm.scorePrompt.mockResolvedValue({
      ...mockScore,
      total: 72,
    });

    const result = await scorePromptService(longPrompt);

    expect(result.total).toBe(72);
    expect(mockLlm.scorePrompt).toHaveBeenCalledWith(longPrompt);
  });

  test("should handle prompts with special characters", async () => {
    const specialPrompt = 'Write code: "special chars" & <symbols> 中文';

    mockLlm.scorePrompt.mockResolvedValue(mockScore);

    const result = await scorePromptService(specialPrompt);

    expect(result).toEqual(mockScore);
    expect(mockLlm.scorePrompt).toHaveBeenCalledWith(specialPrompt);
  });

  test("should return score with all dimensions present", async () => {
    mockLlm.scorePrompt.mockResolvedValue(mockScore);

    const result = await scorePromptService("Write code");

    expect(result.dimensions).toHaveProperty("specificity");
    expect(result.dimensions).toHaveProperty("context");
    expect(result.dimensions).toHaveProperty("output_spec");
    expect(result.dimensions).toHaveProperty("runnability");
    expect(result.dimensions).toHaveProperty("evaluation");
    expect(result.dimensions).toHaveProperty("safety");
  });
});
