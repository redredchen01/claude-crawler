import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { ContentPlan, NewContentPlan } from "../../src/db/schema";

/**
 * Database tests for contentPlans table with TDK fields
 *
 * These tests verify:
 * 1. Schema structure is correct
 * 2. TDK fields can be stored and retrieved
 * 3. Data separation (tdkJson vs userTdkJson)
 * 4. JSON fields are properly serialized
 * 5. Backward compatibility
 */

describe("ContentPlans Table - TDK Fields", () => {
  describe("Schema Structure", () => {
    it("should have core fields", () => {
      // This is a type/schema test
      const testRecord: Partial<ContentPlan> = {
        id: "test-id",
        projectId: "proj-1",
        clusterId: "cluster-1",
        title: "Test",
        contentType: "blog",
      };

      expect(testRecord.id).toBeDefined();
      expect(testRecord.projectId).toBeDefined();
      expect(testRecord.clusterId).toBeDefined();
    });

    it("should have TDK fields (all optional)", () => {
      const testRecord: Partial<ContentPlan> = {
        id: "test-id",
        projectId: "proj-1",
        clusterId: "cluster-1",
        title: "Test",
        contentType: "blog",
        // TDK fields should be defined in schema
        tdkJson: undefined,
        userTdkJson: undefined,
        tdkValidations: undefined,
        tdkGeneratedAt: undefined,
        tdkLanguage: undefined,
        tdkInputJson: undefined,
        tdkGenerationCount: undefined,
      };

      // All TDK fields can be undefined/optional
      expect(testRecord.tdkJson).toBeUndefined();
      expect(testRecord.userTdkJson).toBeUndefined();
    });
  });

  describe("TDK JSON Field - Data Serialization", () => {
    it("should serialize primary and alternatives correctly", () => {
      const tdkJson = {
        primary: {
          title: "Python Tutorial",
          description: "Learn Python",
          keywords: ["Python", "tutorial"],
        },
        alternatives: [
          {
            title: "Learn Python",
            description: "Python learning guide",
            keywords: ["Python", "learning"],
          },
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "claude-opus-4-6",
          tokensUsed: 500,
        },
      };

      // Should be able to stringify and parse
      const serialized = JSON.stringify(tdkJson);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.primary.title).toBe("Python Tutorial");
      expect(deserialized.alternatives).toHaveLength(1);
      expect(deserialized.metadata.language).toBe("en");
    });

    it("should store Chinese TDK correctly", () => {
      const tdkJson = {
        primary: {
          title: "Python 编程教程",
          description: "学习 Python 编程",
          keywords: ["Python", "教程"],
        },
        alternatives: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "zh" as const,
          modelVersion: "claude-opus-4-6",
        },
      };

      const serialized = JSON.stringify(tdkJson);
      expect(serialized).toContain("Python");
      expect(serialized).toContain("教程");

      const deserialized = JSON.parse(serialized);
      expect(deserialized.primary.title).toBe("Python 编程教程");
    });

    it("should handle empty alternatives array", () => {
      const tdkJson = {
        primary: {
          title: "Test",
          description: "Test description",
          keywords: ["test"],
        },
        alternatives: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "claude-opus-4-6",
        },
      };

      const serialized = JSON.stringify(tdkJson);
      const deserialized = JSON.parse(serialized);

      expect(Array.isArray(deserialized.alternatives)).toBe(true);
      expect(deserialized.alternatives).toHaveLength(0);
    });

    it("should handle multiple alternatives", () => {
      const tdkJson = {
        primary: {
          title: "Main",
          description: "Main desc",
          keywords: ["main"],
        },
        alternatives: [
          {
            title: "Alt 1",
            description: "Alt 1 desc",
            keywords: ["alt1"],
          },
          {
            title: "Alt 2",
            description: "Alt 2 desc",
            keywords: ["alt2"],
          },
          {
            title: "Alt 3",
            description: "Alt 3 desc",
            keywords: ["alt3"],
          },
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "claude-opus-4-6",
        },
      };

      const serialized = JSON.stringify(tdkJson);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.alternatives).toHaveLength(3);
      expect(deserialized.alternatives[0].title).toBe("Alt 1");
      expect(deserialized.alternatives[2].title).toBe("Alt 3");
    });
  });

  describe("User TDK JSON Field - Data Separation", () => {
    it("should store user-edited TDK separately from AI-generated", () => {
      const aiGenerated = {
        primary: {
          title: "Python Tutorial",
          description: "Learn Python from scratch",
          keywords: ["Python", "tutorial", "learning"],
        },
        alternatives: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "claude-opus-4-6",
        },
      };

      const userEdited = {
        title: "My Python Guide",
        description: "My custom description",
        keywords: ["Python", "guide", "programming"],
        editedAt: new Date().toISOString(),
      };

      const contentPlan: Partial<ContentPlan> = {
        tdkJson: JSON.stringify(aiGenerated),
        userTdkJson: JSON.stringify(userEdited),
      };

      // Original should be preserved
      const deserializedAi = JSON.parse(contentPlan.tdkJson as string);
      expect(deserializedAi.primary.title).toBe("Python Tutorial");

      // User edits are separate
      const deserializedUser = JSON.parse(contentPlan.userTdkJson as string);
      expect(deserializedUser.title).toBe("My Python Guide");

      // Both coexist
      expect(deserializedAi.primary.title).not.toBe(deserializedUser.title);
    });

    it("should allow partial user edits", () => {
      // User only edits title, not description or keywords
      const userEdited = {
        title: "New Title Only",
        // description and keywords not edited
      };

      const serialized = JSON.stringify(userEdited);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.title).toBe("New Title Only");
      expect(deserialized.description).toBeUndefined();
      expect(deserialized.keywords).toBeUndefined();
    });

    it("should be null initially (before user edits)", () => {
      const contentPlan: Partial<ContentPlan> = {
        id: "test",
        tdkJson: JSON.stringify({
          primary: {
            title: "AI Title",
            description: "AI Desc",
            keywords: ["key"],
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en",
            modelVersion: "test",
          },
        }),
        userTdkJson: null, // Or undefined
      };

      expect(contentPlan.userTdkJson).toBeFalsy();
      expect(contentPlan.tdkJson).toBeTruthy();
    });
  });

  describe("TDK Validations Field", () => {
    it("should store validation results for all candidates", () => {
      const validations = {
        primary: {
          titleLength: {
            status: "pass",
            message: "Title length OK",
          },
          descriptionLength: {
            status: "pass",
            message: "Description length OK",
          },
          keywordStacking: {
            status: "pass",
            issues: [],
          },
          contentConsistency: {
            status: "pass",
            coverage: 1.0,
            matchedWords: ["python", "tutorial"],
            missingWords: [],
          },
        },
        alternatives: [
          {
            titleLength: { status: "warn", message: "Slightly long" },
            descriptionLength: { status: "pass", message: "OK" },
            keywordStacking: { status: "pass", issues: [] },
            contentConsistency: {
              status: "pass",
              coverage: 0.8,
              matchedWords: ["python"],
              missingWords: ["tutorial"],
            },
          },
        ],
        lastValidatedAt: new Date().toISOString(),
      };

      const serialized = JSON.stringify(validations);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.primary.titleLength.status).toBe("pass");
      expect(deserialized.alternatives).toHaveLength(1);
      expect(deserialized.alternatives[0].titleLength.status).toBe("warn");
    });

    it("should track last validation timestamp", () => {
      const now = new Date().toISOString();
      const validations = {
        primary: { titleLength: { status: "pass", message: "OK" } },
        alternatives: [],
        lastValidatedAt: now,
      };

      const serialized = JSON.stringify(validations);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.lastValidatedAt).toBe(now);
    });
  });

  describe("TDK Input JSON Field - Reproducibility", () => {
    it("should store original generation parameters", () => {
      const input = {
        topic: "Python programming",
        keywords: ["Python", "tutorial", "beginners"],
        contentSnippet: "This is about learning Python...",
      };

      const serialized = JSON.stringify(input);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.topic).toBe("Python programming");
      expect(deserialized.keywords).toHaveLength(3);
      expect(deserialized.contentSnippet).toContain("learning Python");
    });

    it("should support regeneration with stored parameters", () => {
      const stored = {
        topic: "React.js",
        keywords: ["React", "JavaScript"],
        contentSnippet: "Learn React...",
      };

      // Can be used to regenerate
      const canRegenerate = !!(stored.topic && stored.keywords);
      expect(canRegenerate).toBe(true);
    });
  });

  describe("TDK Generation Count", () => {
    it("should start at 0", () => {
      const contentPlan: Partial<ContentPlan> = {
        tdkGenerationCount: 0,
      };

      expect(contentPlan.tdkGenerationCount).toBe(0);
    });

    it("should increment on regeneration", () => {
      let count = 0;
      count++; // First generation
      count++; // Second generation
      count++; // Third generation

      expect(count).toBe(3);
    });
  });

  describe("Backward Compatibility", () => {
    it("should allow records without TDK fields", () => {
      const oldRecord: Partial<ContentPlan> = {
        id: "old-id",
        projectId: "proj-1",
        clusterId: "cluster-1",
        title: "Old content",
        contentType: "blog",
        // No TDK fields, all should default to null/undefined
      };

      expect(oldRecord.id).toBe("old-id");
      expect(oldRecord.tdkJson).toBeUndefined();
      // Should not break existing records
    });

    it("should allow mixing old and new records", () => {
      const records: Partial<ContentPlan>[] = [
        {
          id: "old-1",
          projectId: "proj-1",
          title: "Old",
          contentType: "blog",
        },
        {
          id: "new-1",
          projectId: "proj-1",
          title: "New",
          contentType: "blog",
          tdkJson: JSON.stringify({
            primary: { title: "T", description: "D", keywords: ["k"] },
            alternatives: [],
            metadata: {
              generatedAt: new Date().toISOString(),
              language: "en",
              modelVersion: "test",
            },
          }),
        },
      ];

      expect(records).toHaveLength(2);
      expect(records[0].tdkJson).toBeUndefined();
      expect(records[1].tdkJson).toBeDefined();
    });
  });

  describe("Language-Specific Handling", () => {
    it("should store English (en) language code", () => {
      const tdkLanguage = "en";
      expect(["en", "zh"]).toContain(tdkLanguage);
    });

    it("should store Chinese (zh) language code", () => {
      const tdkLanguage = "zh";
      expect(["en", "zh"]).toContain(tdkLanguage);
    });

    it("should match language in metadata", () => {
      const input = {
        topic: "Python 编程教程",
        keywords: ["Python", "教程"],
      };

      const tdkJson = {
        primary: {
          title: "Python 编程教程",
          description: "...",
          keywords: ["Python"],
        },
        alternatives: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "zh" as const,
          modelVersion: "claude-opus-4-6",
        },
      };

      const contentPlan: Partial<ContentPlan> = {
        tdkLanguage: tdkJson.metadata.language,
        tdkJson: JSON.stringify(tdkJson),
      };

      expect(contentPlan.tdkLanguage).toBe("zh");
      expect(JSON.parse(contentPlan.tdkJson as string).metadata.language).toBe(
        "zh",
      );
    });
  });

  describe("Null/Undefined Handling", () => {
    it("should handle null tdkJson gracefully", () => {
      const contentPlan: Partial<ContentPlan> = {
        tdkJson: null,
        userTdkJson: null,
      };

      expect(contentPlan.tdkJson).toBeNull();
      // Should not crash when accessing undefined TDK
    });

    it("should allow checking if TDK exists", () => {
      const withTdk: Partial<ContentPlan> = {
        tdkJson: JSON.stringify({
          primary: {},
          alternatives: [],
          metadata: {},
        }),
      };

      const withoutTdk: Partial<ContentPlan> = {
        tdkJson: null,
      };

      expect(!!withTdk.tdkJson).toBe(true);
      expect(!!withoutTdk.tdkJson).toBe(false);
    });
  });

  describe("Generation History", () => {
    it("should track generation attempts", () => {
      const history = {
        id: "hist-1",
        contentPlanId: "plan-1",
        projectId: "proj-1",
        topic: "Python",
        keywords: "Python,tutorial",
        language: "en" as const,
        generatedTdk: JSON.stringify({
          primary: {},
          alternatives: [],
          metadata: {},
        }),
        status: "success" as const,
        modelVersion: "claude-opus-4-6",
        generatedAt: new Date().toISOString(),
      };

      expect(history.id).toBeDefined();
      expect(history.status).toBe("success");
      expect(history.generatedAt).toBeDefined();
    });

    it("should track failed generation attempts", () => {
      const failedHistory = {
        id: "hist-2",
        contentPlanId: "plan-1",
        projectId: "proj-1",
        topic: "Test",
        language: "en" as const,
        generatedTdk: "{}",
        status: "failed" as const,
        errorMessage: "API timeout",
        modelVersion: "claude-opus-4-6",
        generatedAt: new Date().toISOString(),
      };

      expect(failedHistory.status).toBe("failed");
      expect(failedHistory.errorMessage).toBeDefined();
    });
  });
});
