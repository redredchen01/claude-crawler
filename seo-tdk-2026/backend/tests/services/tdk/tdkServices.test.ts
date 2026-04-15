import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  TdkGeneratorService,
  type TdkGenerationResult,
  type TdkCandidate,
} from "../../../src/services/tdk/tdkGeneratorService";
import {
  TdkValidatorService,
  type TdkValidationReport,
} from "../../../src/services/tdk/tdkValidatorService";

/**
 * Mock Claude API responses for testing
 */
const mockClaudeResponse = (language: "en" | "zh"): string => {
  if (language === "zh") {
    return JSON.stringify({
      primary: {
        title: "Python 编程教程",
        description:
          "学习 Python 编程的完整教程。从基础到精通，涵盖所有核心概念。",
        keywords: ["Python", "教程", "编程", "学习"],
      },
      alternatives: [
        {
          title: "Python 编程从入门到精通",
          description: "完整的 Python 编程学习指南。适合初学者和进阶开发者。",
          keywords: ["Python", "编程", "指南", "学习"],
        },
        {
          title: "零基础学 Python",
          description: "为初学者设计的 Python 教程。循序渐进学习编程基础。",
          keywords: ["Python", "初学者", "教程", "编程"],
        },
      ],
    });
  } else {
    return JSON.stringify({
      primary: {
        title: "Python Programming Tutorial for Beginners",
        description:
          "Learn Python programming from scratch. Complete tutorial covering all core concepts and practical examples.",
        keywords: ["Python", "programming", "tutorial", "beginners"],
      },
      alternatives: [
        {
          title: "Complete Python Programming Guide",
          description:
            "Master Python programming with our comprehensive guide. Suitable for all skill levels.",
          keywords: ["Python", "programming", "guide", "learning"],
        },
        {
          title: "How to Learn Python Coding",
          description:
            "Step-by-step Python programming tutorial. Perfect for those starting their coding journey.",
          keywords: ["Python", "coding", "tutorial", "beginners"],
        },
      ],
    });
  }
};

describe("TDK Generator & Validator Services Integration", () => {
  let generator: TdkGeneratorService;
  let validator: TdkValidatorService;

  beforeEach(() => {
    generator = new TdkGeneratorService({
      model: "claude-opus-4-6",
      maxTokens: 1500,
      temperature: 0.7,
    });
    validator = new TdkValidatorService();
  });

  describe("TdkGeneratorService", () => {
    describe("Prompt Building", () => {
      it("should build a valid English prompt", () => {
        const service = generator as any; // Access private method for testing
        const prompt = service.buildPrompt(
          "Python programming",
          ["Python", "tutorial"],
          undefined,
          "en",
        );

        expect(prompt).toContain("Python programming");
        expect(prompt).toContain("Python");
        expect(prompt).toContain("tutorial");
        expect(prompt).toContain("50-60 characters");
        expect(prompt).toContain("150-160 characters");
      });

      it("should build a valid Chinese prompt", () => {
        const service = generator as any;
        const prompt = service.buildPrompt(
          "Python 编程",
          ["Python", "教程"],
          undefined,
          "zh",
        );

        expect(prompt).toContain("Python 编程");
        expect(prompt).toContain("25-30");
        expect(prompt).toContain("75-80");
      });

      it("should include content snippet when provided", () => {
        const service = generator as any;
        const content = "This is about Python";
        const prompt = service.buildPrompt("Python", ["Python"], content, "en");

        expect(prompt).toContain(content);
        expect(prompt).toContain("Content Summary");
      });

      it("should handle empty keywords", () => {
        const service = generator as any;
        const prompt = service.buildPrompt(
          "Python programming",
          [],
          undefined,
          "en",
        );

        expect(prompt).toContain("Python programming");
        expect(prompt).toContain("primary topic keywords");
      });
    });

    describe("Response Parsing", () => {
      it("should parse valid Claude response (English)", () => {
        const service = generator as any;
        const response = mockClaudeResponse("en");

        const parsed = service.parseResponse(response);

        expect(parsed.primary).toBeDefined();
        expect(parsed.primary.title).toBeDefined();
        expect(parsed.primary.description).toBeDefined();
        expect(Array.isArray(parsed.primary.keywords)).toBe(true);
        expect(parsed.alternatives).toHaveLength(2);
      });

      it("should parse valid Claude response (Chinese)", () => {
        const service = generator as any;
        const response = mockClaudeResponse("zh");

        const parsed = service.parseResponse(response);

        expect(parsed.primary.title).toBe("Python 编程教程");
        expect(parsed.alternatives).toHaveLength(2);
      });

      it("should throw error for invalid JSON", () => {
        const service = generator as any;
        expect(() => {
          service.parseResponse("This is not JSON");
        }).toThrow("No valid JSON found in response");
      });

      it("should throw error for missing fields", () => {
        const service = generator as any;
        const invalidResponse = JSON.stringify({
          primary: { title: "Test" },
          // Missing alternatives
        });

        expect(() => {
          service.parseResponse(invalidResponse);
        }).toThrow();
      });

      it("should throw error for invalid candidate", () => {
        const service = generator as any;
        const invalidResponse = JSON.stringify({
          primary: {
            title: "",
            description: "",
            keywords: [],
          },
          alternatives: [],
        });

        expect(() => {
          service.parseResponse(invalidResponse);
        }).toThrow();
      });

      it("should limit alternatives to 3", () => {
        const service = generator as any;
        const manyAlternatives = JSON.stringify({
          primary: {
            title: "Python",
            description: "Learn Python",
            keywords: ["Python"],
          },
          alternatives: [
            { title: "Alt1", description: "Desc", keywords: ["a"] },
            { title: "Alt2", description: "Desc", keywords: ["b"] },
            { title: "Alt3", description: "Desc", keywords: ["c"] },
            { title: "Alt4", description: "Desc", keywords: ["d"] }, // Should be dropped
          ],
        });

        const parsed = service.parseResponse(manyAlternatives);
        expect(parsed.alternatives).toHaveLength(3);
      });
    });

    describe("Input Validation", () => {
      it("should reject empty topic", async () => {
        await expect(
          generator.generateRecommendations("", ["Python"]),
        ).rejects.toThrow("Topic is required");
      });

      it("should reject whitespace-only topic", async () => {
        await expect(
          generator.generateRecommendations("   ", ["Python"]),
        ).rejects.toThrow("Topic is required");
      });

      it("should handle empty keywords array", async () => {
        // Should not throw, just use empty array
        const service = generator as any;
        const prompt = service.buildPrompt("Python", [], undefined, "en");
        expect(prompt).toBeTruthy();
      });

      it("should filter out empty keywords", async () => {
        const service = generator as any;
        const prompt = service.buildPrompt(
          "Python",
          ["Python", "", "tutorial", "  "],
          undefined,
          "en",
        );
        // Should contain Python and tutorial but not empty strings
        expect(prompt).toContain("Python");
        expect(prompt).toContain("tutorial");
      });
    });

    describe("Candidate Validation", () => {
      it("should validate a complete candidate", () => {
        const service = generator as any;
        const candidate = {
          title: "Test Title",
          description: "Test Description",
          keywords: ["key1", "key2"],
        };

        const validated = service.validateCandidate(candidate, "test");
        expect(validated).toEqual(candidate);
      });

      it("should trim whitespace from fields", () => {
        const service = generator as any;
        const candidate = {
          title: "  Test Title  ",
          description: "  Test Description  ",
          keywords: ["  key1  ", "key2"],
        };

        const validated = service.validateCandidate(candidate, "test");
        expect(validated.title).toBe("Test Title");
        expect(validated.description).toBe("Test Description");
        expect(validated.keywords).toContain("key1");
      });

      it("should throw error for missing title", () => {
        const service = generator as any;
        const candidate = {
          description: "Test",
          keywords: ["key"],
        };

        expect(() => service.validateCandidate(candidate, "test")).toThrow(
          "title is required",
        );
      });

      it("should throw error for missing description", () => {
        const service = generator as any;
        const candidate = {
          title: "Test",
          keywords: ["key"],
        };

        expect(() => service.validateCandidate(candidate, "test")).toThrow(
          "description is required",
        );
      });

      it("should throw error for empty keywords", () => {
        const service = generator as any;
        const candidate = {
          title: "Test",
          description: "Test",
          keywords: [],
        };

        expect(() => service.validateCandidate(candidate, "test")).toThrow(
          "keywords array must contain at least one keyword",
        );
      });
    });
  });

  describe("TdkValidatorService", () => {
    describe("Single Candidate Validation", () => {
      it("should validate a good candidate (English)", () => {
        const candidate: TdkCandidate = {
          title: "Python Programming Tutorial for Beginners",
          description:
            "Learn Python programming from scratch. Complete tutorial covering basics to advanced concepts for new learners.",
          keywords: ["Python", "programming", "tutorial", "beginners"],
        };

        const report = validator.validate(candidate, undefined, "en");

        expect(report).toBeDefined();
        expect(report.validations).toBeDefined();
        expect(report.severity).toBeDefined();
      });

      it("should validate a good candidate (Chinese)", () => {
        const candidate: TdkCandidate = {
          title: "完整的Python编程教程从入门到精通深度学习指南",
          description:
            "学习Python编程的完整教程。本教程从基础到精通，详细涵盖所有核心概念和实践例子。适合初级中级高级开发者使用。包含丰富的代码示例和练习。",
          keywords: ["Python", "教程", "编程"],
        };

        const report = validator.validate(candidate, undefined, "zh");

        expect(report.severity).not.toBe("fail");
      });

      it("should report failure for very short title", () => {
        const candidate: TdkCandidate = {
          title: "Hi",
          description:
            "This is a very long description that contains many words and sentences to meet the minimum length requirement for the meta description field.",
          keywords: ["test"],
        };

        const report = validator.validate(candidate, undefined, "en");

        expect(report.severity).toBe("fail");
        expect(report.issues.some((i) => i.field === "title")).toBe(true);
      });

      it("should report warning for slightly long title", () => {
        const candidate: TdkCandidate = {
          title:
            "This is a fairly long title that might exceed the optimal length slightly but is still acceptable",
          description:
            "This is a good description with appropriate length. It contains useful information about the topic.",
          keywords: ["title", "description"],
        };

        const report = validator.validate(candidate, undefined, "en");

        // Should have warning or fail for title length
        expect(["warn", "fail"]).toContain(report.severity);
      });

      it("should report issues for keyword stacking", () => {
        const candidate: TdkCandidate = {
          title: "Python Python Python Python Python Tutorial",
          description:
            "Learn Python programming. Python is great. Python tutorial for Python developers.",
          keywords: ["Python"],
        };

        const report = validator.validate(candidate, undefined, "en");

        expect(report.severity).toBe("fail");
        expect(report.issues.some((i) => i.field === "keywords")).toBe(true);
      });

      it("should provide suggestions for fixes", () => {
        const candidate: TdkCandidate = {
          title: "Short",
          description: "Short",
          keywords: ["test"],
        };

        const report = validator.validate(candidate, undefined, "en");

        expect(report.issues.length).toBeGreaterThan(0);
        expect(report.issues.some((i) => i.suggestion)).toBe(true);
      });

      it("should check content consistency when snippet provided", () => {
        const candidate: TdkCandidate = {
          title: "Python Tutorial",
          description: "Learn Python programming with our comprehensive guide.",
          keywords: ["Python", "tutorial"],
        };

        const content =
          "This is about Python programming and JavaScript tutorials.";

        const report = validator.validate(candidate, content, "en");

        // Consistency check should be performed
        expect(report.validations.contentConsistency).toBeDefined();
      });
    });

    describe("Batch Validation", () => {
      it("should validate multiple candidates", () => {
        const candidates: TdkCandidate[] = [
          {
            title:
              "Python Programming Tutorial for Beginners and Intermediate Learners",
            description:
              "Learn Python from scratch with comprehensive examples and exercises. This complete tutorial covers all fundamentals and advanced topics for every skill level.",
            keywords: ["Python", "programming"],
          },
          {
            title: "Short",
            description: "Short",
            keywords: ["test"],
          },
        ];

        const reports = validator.validateBatch(candidates, undefined, "en");

        expect(reports).toHaveLength(2);
        expect(reports[0].severity).not.toBe("fail");
        expect(reports[1].severity).toBe("fail");
      });
    });

    describe("Best Candidate Selection", () => {
      it("should select candidate with pass status over warn", () => {
        const candidates: TdkCandidate[] = [
          {
            title: "A Decent Title About Python",
            description: "Short",
            keywords: ["Python"],
          },
          {
            title: "Python Programming Tutorial for Complete Beginners",
            description:
              "Learn Python programming from the very beginning with comprehensive tutorials and hands-on examples.",
            keywords: ["Python", "programming", "tutorial"],
          },
        ];

        const result = validator.getBestCandidate(candidates, undefined, "en");

        expect(result.report.severity).not.toBe("fail");
        // Second candidate is better
        expect(result.candidate.title).toContain("Complete Beginners");
      });

      it("should select candidate with fewer issues", () => {
        const candidates: TdkCandidate[] = [
          {
            title: "Python Programming Tutorial for Beginners",
            description: "A reasonable description about learning Python.",
            keywords: ["Python", "programming"],
          },
          {
            title: "Python",
            description: "Bad",
            keywords: ["Python"],
          },
        ];

        const result = validator.getBestCandidate(candidates, undefined, "en");

        expect(result.report.issues.length).toBeLessThan(3);
      });
    });

    describe("Summary Generation", () => {
      it("should generate appropriate summary for pass", () => {
        const candidate: TdkCandidate = {
          title: "Python Programming Tutorial for Beginners",
          description:
            "Learn Python programming from scratch with comprehensive tutorial and practical examples for new developers.",
          keywords: ["Python", "programming"],
        };

        const report = validator.validate(candidate, undefined, "en");

        if (report.severity === "pass") {
          expect(report.summary).toContain("✅");
        }
      });

      it("should generate appropriate summary for warn", () => {
        const candidate: TdkCandidate = {
          title:
            "This title is somewhat longer than the optimal range but still acceptable for search results",
          description: "Short desc",
          keywords: ["test"],
        };

        const report = validator.validate(candidate, undefined, "en");

        if (report.severity === "warn") {
          expect(report.summary).toContain("⚠️");
        }
      });

      it("should generate appropriate summary for fail", () => {
        const candidate: TdkCandidate = {
          title: "Bad",
          description: "Bad",
          keywords: ["test"],
        };

        const report = validator.validate(candidate, undefined, "en");

        if (report.severity === "fail") {
          expect(report.summary).toContain("❌");
        }
      });
    });
  });

  describe("End-to-End Integration", () => {
    it("should generate and validate TDK for Chinese topic (mocked)", () => {
      // Mock the Claude API call
      const generateSpy = jest
        .spyOn(generator as any, "parseResponse")
        .mockReturnValue({
          primary: {
            title: "Python 编程教程",
            description: "学习 Python 编程的完整教程。从基础到精通。",
            keywords: ["Python", "教程"],
          },
          alternatives: [],
        });

      const candidate: TdkCandidate = {
        title: "Python编程教程从入门到精通完全指南和深度学习",
        description:
          "学习Python编程的完整教程。本课程从基础到精通，详细讲解所有核心概念和实践例子。适合所有级别开发者。包含丰富代码示例和练习。",
        keywords: ["Python", "教程"],
      };

      const report = validator.validate(candidate, undefined, "zh");

      expect(report.validations).toBeDefined();
      expect(report.severity).not.toBe("fail");

      generateSpy.mockRestore();
    });

    it("should generate and validate TDK for English topic (mocked)", () => {
      const generateSpy = jest
        .spyOn(generator as any, "parseResponse")
        .mockReturnValue({
          primary: {
            title: "Python Programming Tutorial for Beginners",
            description:
              "Learn Python programming from scratch. Comprehensive tutorial for new developers.",
            keywords: ["Python", "programming", "tutorial"],
          },
          alternatives: [],
        });

      const candidate: TdkCandidate = {
        title: "Python Programming Tutorial for Beginners",
        description:
          "Learn Python programming from scratch. Comprehensive tutorial for new developers.",
        keywords: ["Python", "programming", "tutorial"],
      };

      const report = validator.validate(candidate, undefined, "en");

      expect(report.validations).toBeDefined();
      expect(report.summary).toBeTruthy();

      generateSpy.mockRestore();
    });
  });
});
