/**
 * Mock services for TDK API tests
 */

import type {
  TdkCandidate,
  TdkGenerationResult,
} from "../../src/services/tdk/tdkGeneratorService";
import type { TdkValidationReport } from "../../src/services/tdk/tdkValidatorService";
import { TdkGeneratorService } from "../../src/services/tdk/tdkGeneratorService";
import { TdkValidatorService } from "../../src/services/tdk/tdkValidatorService";
import type { Language } from "../../src/services/tdk/tdkRules";

/**
 * Mock TDK Generator Service
 */
export class MockTdkGeneratorService extends TdkGeneratorService {
  async generateRecommendations(
    topic: string,
    keywords: string[],
    contentSnippet?: string,
    language: Language = "en",
  ): Promise<TdkGenerationResult> {
    // Return mock data that matches the expected structure
    const primary: TdkCandidate = {
      title: `${topic} - Complete Guide`,
      description: `Learn everything about ${topic}. ${contentSnippet || "Best practices and techniques."}`,
      keywords: [...keywords, "guide", "tutorial"],
    };

    const alternatives: TdkCandidate[] = [
      {
        title: `How to ${topic}`,
        description: `Step-by-step instructions for ${topic}. Includes tips and best practices.`,
        keywords: [...keywords, "how-to", "instructions"],
      },
      {
        title: `${topic} Tips & Tricks`,
        description: `Expert tips for mastering ${topic}. Improve your skills with proven strategies.`,
        keywords: [...keywords, "tips", "strategies"],
      },
    ];

    return {
      primary,
      alternatives,
      metadata: {
        generatedAt: new Date(),
        language,
        modelVersion: "mock-v1.0",
        tokensUsed: 1000,
      },
    };
  }
}

/**
 * Mock TDK Validator Service
 */
export class MockTdkValidatorService extends TdkValidatorService {
  validateBatch(
    candidates: TdkCandidate[],
    contentSnippet?: string,
    language: Language = "en",
  ): TdkValidationReport[] {
    // Return mock validation reports for each candidate
    return candidates.map(() => ({
      isValid: true,
      severity: "pass" as const,
      validations: {
        titleLength: {
          status: "pass",
          message: "Title length is optimal",
          length: 50,
          optimalRange: "30-60",
          min: 30,
          max: 60,
        },
        descriptionLength: {
          status: "pass",
          message: "Description length is optimal",
          length: 150,
          optimalRange: "120-160",
          min: 120,
          max: 160,
        },
        keywordStacking: {
          status: "pass",
          issues: [],
          message: "No keyword stacking detected",
        },
        contentConsistency: {
          status: "pass",
          coverage: 100,
          matchedWords: [],
          missingWords: [],
          message: "Content is consistent",
        },
      },
      summary: "All validations passed",
      issues: [],
    }));
  }
}
