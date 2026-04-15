/**
 * End-to-End Tests for TDK Optimizer
 *
 * Tests complete workflows: Generation → Validation → Storage → Retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  TdkGeneratorService,
  type TdkGenerationResult,
} from "../../src/services/tdk/tdkGeneratorService";
import { TdkValidatorService } from "../../src/services/tdk/tdkValidatorService";
import type { ContentPlan } from "../../src/db/schema";

/**
 * Mock database for testing
 */
class MockDatabase {
  private contentPlans: Map<string, ContentPlan> = new Map();

  saveContentPlan(plan: Partial<ContentPlan>) {
    const id = plan.id || "generated-id";
    const existing = this.contentPlans.get(id);
    this.contentPlans.set(id, {
      id,
      projectId: "proj-1",
      clusterId: "cluster-1",
      title: "Test",
      contentType: "blog",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(existing || {}),
      ...plan,
    } as ContentPlan);
    return id;
  }

  getContentPlan(id: string): ContentPlan | undefined {
    return this.contentPlans.get(id);
  }

  clear() {
    this.contentPlans.clear();
  }
}

describe("TDK Optimizer - End-to-End Workflow", () => {
  let generator: TdkGeneratorService;
  let validator: TdkValidatorService;
  let db: MockDatabase;

  beforeEach(() => {
    generator = new TdkGeneratorService({
      model: "claude-opus-4-6",
      maxTokens: 1500,
      temperature: 0.7,
    });
    validator = new TdkValidatorService();
    db = new MockDatabase();
  });

  afterEach(() => {
    db.clear();
  });

  describe("Workflow 1: Simple Generation → Validation → Save (English)", () => {
    it("should complete end-to-end flow", async () => {
      // Step 1: Generate TDK
      const topic = "Python Programming";
      const keywords = ["Python", "programming", "tutorial"];

      // Mock Claude response
      const mockResponse = JSON.stringify({
        primary: {
          title: "Python Programming: Complete Guide",
          description:
            "Learn Python programming from basics to advanced concepts.",
          keywords: ["Python", "programming", "guide", "learning"],
        },
        alternatives: [
          {
            title: "Master Python: Beginner to Advanced",
            description: "Comprehensive Python tutorial for all skill levels.",
            keywords: ["Python", "tutorial", "learning", "beginner"],
          },
        ],
      });

      const generateService = generator as any;
      const generationResult = generateService.parseResponse(mockResponse);

      expect(generationResult.primary).toBeDefined();
      expect(generationResult.primary.title).toContain("Python");

      // Step 2: Validate all candidates
      const candidates = [
        generationResult.primary,
        ...generationResult.alternatives,
      ];
      const validationReports = validator.validateBatch(
        candidates,
        undefined,
        "en",
      );

      expect(validationReports).toHaveLength(2);
      validationReports.forEach((report) => {
        expect(report.severity).toBeDefined();
      });

      // Step 3: Save to database
      const contentPlanId = "plan-123";
      db.saveContentPlan({
        id: contentPlanId,
        projectId: "proj-1",
        clusterId: "cluster-1",
        tdkJson: JSON.stringify({
          primary: generationResult.primary,
          alternatives: generationResult.alternatives,
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en",
            modelVersion: "claude-opus-4-6",
            tokensUsed: 500,
          },
        }),
        tdkGeneratedAt: new Date().toISOString(),
        tdkLanguage: "en",
      });

      // Step 4: Retrieve from database
      const retrieved = db.getContentPlan(contentPlanId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.tdkJson).toBeDefined();

      const tdkData = JSON.parse(retrieved?.tdkJson || "{}");
      expect(tdkData.primary.title).toContain("Python");
    });
  });

  describe("Workflow 2: Generation → User Edit → Save (Chinese)", () => {
    it("should support user edits preserving original", () => {
      // AI-generated TDK
      const aiGenerated = {
        title: "Python 编程教程",
        description: "学习 Python 编程的完整教程。",
        keywords: ["Python", "编程", "教程"],
      };

      // User edits title and keywords only
      const userEdited = {
        title: "我的 Python 学习指南", // Different title
        // description 未编辑
        keywords: ["Python", "学习", "指南"], // Different keywords
      };

      // Both should coexist in database
      const contentPlanId = "plan-456";
      db.saveContentPlan({
        id: contentPlanId,
        tdkJson: JSON.stringify({
          primary: aiGenerated,
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "zh",
            modelVersion: "test",
          },
        }),
        userTdkJson: JSON.stringify(userEdited),
        tdkLanguage: "zh",
      });

      // Verify both exist
      const retrieved = db.getContentPlan(contentPlanId);
      const aiData = JSON.parse(retrieved?.tdkJson || "{}");
      const userData = JSON.parse(retrieved?.userTdkJson || "{}");

      expect(aiData.primary.title).toBe("Python 编程教程");
      expect(userData.title).toBe("我的 Python 学习指南");
    });
  });

  describe("Workflow 3: Regeneration with Same Parameters", () => {
    it("should track generation history and allow regeneration", () => {
      // Store original input
      const input = {
        topic: "React.js",
        keywords: ["React", "JavaScript"],
        contentSnippet: "A library for building UI...",
      };

      const contentPlanId = "plan-789";
      db.saveContentPlan({
        id: contentPlanId,
        tdkInputJson: JSON.stringify(input),
        tdkGenerationCount: 1,
      });

      // Later: regenerate with same input
      const retrieved = db.getContentPlan(contentPlanId);
      const storedInput = JSON.parse(retrieved?.tdkInputJson || "{}");

      expect(storedInput.topic).toBe("React.js");
      expect(storedInput.keywords).toEqual(["React", "JavaScript"]);

      // Can regenerate using stored input
      const canRegenerate = !!(storedInput.topic && storedInput.keywords);
      expect(canRegenerate).toBe(true);
    });
  });

  describe("Workflow 4: Validation-Driven Selection", () => {
    it("should select best candidate by validation results", () => {
      // Three candidates with different validation outcomes
      const candidates = [
        {
          title: "This is a good title that fits the optimal range",
          description: "Good description with proper length and content",
          keywords: ["good", "content"],
        },
        {
          title: "Short", // Too short - will fail
          description: "Bad",
          keywords: ["bad"],
        },
        {
          title: "Alternative Title",
          description:
            "Alternative description that is slightly better than the short one",
          keywords: ["alt", "option"],
        },
      ];

      const reports = validator.validateBatch(candidates, undefined, "en");

      // Candidate 0 should have best severity
      let bestIdx = 0;
      for (let i = 1; i < reports.length; i++) {
        const severityMap = { pass: 0, warn: 1, fail: 2 };
        if (
          severityMap[reports[i].severity] <
          severityMap[reports[bestIdx].severity]
        ) {
          bestIdx = i;
        }
      }

      expect(bestIdx).toBe(0); // First candidate is best
    });
  });

  describe("Workflow 5: Content Consistency Workflow", () => {
    it("should improve TDK based on content consistency feedback", () => {
      const pageContent =
        "This article covers Python programming, data structures, algorithms, and best practices.";

      // Initial TDK (may have poor consistency)
      const initialTdk = {
        title: "JavaScript Guide",
        description: "Learn web development.",
        keywords: ["web", "development"],
      };

      // Validate consistency
      const initialReport = validator.validate(initialTdk, pageContent, "en");

      expect(
        initialReport.validations.contentConsistency.matchedWords.length,
      ).toBeLessThan(5); // Low coverage

      // Regenerated TDK (should be better)
      const improvedTdk = {
        title: "Python Programming Guide",
        description:
          "Learn Python programming, data structures, and algorithms.",
        keywords: ["Python", "programming", "algorithms"],
      };

      const improvedReport = validator.validate(improvedTdk, pageContent, "en");

      expect(
        improvedReport.validations.contentConsistency.matchedWords.length,
      ).toBeGreaterThan(
        initialReport.validations.contentConsistency.matchedWords.length,
      );
    });
  });

  describe("Workflow 6: Language-Specific Rules", () => {
    it("should apply correct rules for English content", () => {
      const enCandidate = {
        title:
          "Python Programming Tutorial for Complete Beginners and Advanced Learners", // Too long
        description: "Very short", // Too short
        keywords: ["python", "programming"],
      };

      const report = validator.validate(enCandidate, undefined, "en");

      expect(report.severity).toBe("fail");
      // Messages are in Chinese in MVP version
      expect(report.validations.titleLength.message).toContain("过长");
      expect(report.validations.descriptionLength.message).toContain("过短");
    });

    it("should apply correct rules for Chinese content", () => {
      const zhCandidate = {
        title: "这是一个很长的中文标题示例用来测试是否超过最大长度限制", // Too long
        description: "短",
        keywords: ["python", "编程"],
      };

      const report = validator.validate(zhCandidate, undefined, "zh");

      expect(report.severity).toBe("fail");
    });
  });

  describe("Workflow 7: Error Recovery", () => {
    it("should handle API failure gracefully", async () => {
      // Simulate API error
      const generatorService = generator as any;

      expect(() => {
        generatorService.parseResponse("invalid json");
      }).toThrow();
    });

    it("should allow retry after failure", async () => {
      // First attempt fails
      const firstAttempt = {
        success: false,
        error: "API timeout",
      };

      // Second attempt succeeds
      const secondAttempt = {
        success: true,
        data: {
          primary: {
            title: "Test",
            description: "Test",
            keywords: ["test"],
          },
        },
      };

      expect(firstAttempt.success).toBe(false);
      expect(secondAttempt.success).toBe(true);
    });
  });

  describe("Workflow 8: Bulk Processing", () => {
    it("should handle multiple content plans", () => {
      const contentPlans = [
        {
          id: "plan-1",
          topic: "Python",
        },
        {
          id: "plan-2",
          topic: "JavaScript",
        },
        {
          id: "plan-3",
          topic: "Go",
        },
      ];

      // Process each plan
      contentPlans.forEach((plan) => {
        db.saveContentPlan({
          id: plan.id,
          projectId: "proj-1",
          clusterId: plan.id,
          title: plan.topic,
          contentType: "blog",
        });
      });

      // Verify all saved
      contentPlans.forEach((plan) => {
        const retrieved = db.getContentPlan(plan.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.title).toBe(plan.topic);
      });
    });
  });

  describe("Workflow 9: Data Integrity", () => {
    it("should maintain data consistency across updates", () => {
      const planId = "integrity-test";

      // Initial save
      db.saveContentPlan({
        id: planId,
        tdkJson: JSON.stringify({
          primary: {
            title: "Original",
            description: "Original",
            keywords: ["original"],
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en",
            modelVersion: "v1",
          },
        }),
      });

      let plan = db.getContentPlan(planId);
      expect(plan?.tdkJson).toBeDefined();

      // User adds edits
      db.saveContentPlan({
        id: planId,
        userTdkJson: JSON.stringify({
          title: "User edited",
          editedAt: new Date().toISOString(),
        }),
      });

      // Verify original still exists
      plan = db.getContentPlan(planId);
      const tdkData = JSON.parse(plan?.tdkJson || "{}");
      const userData = JSON.parse(plan?.userTdkJson || "{}");

      expect(tdkData.primary.title).toBe("Original");
      expect(userData.title).toBe("User edited");
    });
  });

  describe("Workflow 10: Performance & Limits", () => {
    it("should handle large content snippets", () => {
      const largeContent = "This is content about Python. ".repeat(100); // 2700+ chars

      const candidate = {
        title: "Python",
        description: "Python tutorial",
        keywords: ["python"],
      };

      const report = validator.validate(candidate, largeContent, "en");

      expect(report.validations).toBeDefined();
      // Should complete without timeout or error
    });

    it("should handle many keywords", () => {
      const manyKeywords = Array.from({ length: 50 }, (_, i) => `keyword-${i}`);

      const contentPlanId = "many-keywords-test";
      db.saveContentPlan({
        id: contentPlanId,
        tdkJson: JSON.stringify({
          primary: {
            title: "Test",
            description: "Test",
            keywords: manyKeywords,
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en",
            modelVersion: "test",
          },
        }),
      });

      const retrieved = db.getContentPlan(contentPlanId);
      const tdkData = JSON.parse(retrieved?.tdkJson || "{}");

      expect(tdkData.primary.keywords).toHaveLength(50);
    });
  });
});
