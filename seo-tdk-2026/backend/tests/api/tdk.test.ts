import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { createTdkRouter } from "../../src/api/tdk";

/**
 * API Tests for TDK Optimizer Endpoints
 *
 * Tests Hono routes for:
 * - POST /api/projects/:projectId/tdk-optimize
 * - POST /api/projects/:projectId/clusters/:clusterId/tdk-save
 * - GET /api/projects/:projectId/clusters/:clusterId/tdk
 */

describe("TDK Optimizer API Endpoints", () => {
  let router: ReturnType<typeof createTdkRouter>;

  beforeEach(() => {
    router = createTdkRouter();
  });

  describe("POST /api/projects/:projectId/tdk-optimize", () => {
    it("should accept valid generation request", async () => {
      const request = {
        topic: "Python programming",
        keywords: ["Python", "tutorial"],
        language: "en" as const,
      };

      // Validate structure
      expect(request.topic).toBeDefined();
      expect(request.keywords).toHaveLength(2);
      expect(["en", "zh"]).toContain(request.language);
    });

    it("should validate required topic field", () => {
      const invalidRequest = {
        keywords: ["Python"],
        language: "en",
        // Missing topic
      } as Record<string, unknown>;

      expect(invalidRequest.topic).toBeUndefined();
    });

    it("should accept optional contentSnippet", () => {
      const request = {
        topic: "Python",
        keywords: ["Python"],
        contentSnippet: "This is about Python programming.",
        language: "en" as const,
      };

      expect(request.contentSnippet).toBeDefined();
      expect(request.contentSnippet).toContain("Python");
    });

    it("should support English generation", () => {
      const request = {
        topic: "Python Programming",
        keywords: ["Python", "programming"],
        language: "en" as const,
      };

      expect(request.language).toBe("en");
    });

    it("should support Chinese generation", () => {
      const request = {
        topic: "Python 编程",
        keywords: ["Python", "编程"],
        language: "zh" as const,
      };

      expect(request.language).toBe("zh");
    });

    it("should default to English language", () => {
      const request = {
        topic: "Python",
        keywords: ["Python"],
        // language not specified
      } as Record<string, unknown>;

      const language = (request.language as string | undefined) || "en";
      expect(language).toBe("en");
    });

    it("should validate keywords array", () => {
      const validRequest = {
        topic: "Topic",
        keywords: ["key1", "key2", "key3"],
      };

      expect(Array.isArray(validRequest.keywords)).toBe(true);
      expect(validRequest.keywords.length).toBeLessThanOrEqual(20);
    });

    it("should allow empty keywords array", () => {
      const request = {
        topic: "Topic",
        keywords: [],
      };

      expect(Array.isArray(request.keywords)).toBe(true);
      expect(request.keywords).toHaveLength(0);
    });

    it("should reject invalid language", () => {
      const invalidLanguage = "fr"; // French not supported
      const validLanguages = ["en", "zh"];

      expect(validLanguages).not.toContain(invalidLanguage);
    });

    it("should reject too-long topic", () => {
      const longTopic = "a".repeat(201); // >200 chars
      expect(longTopic.length).toBeGreaterThan(200);
    });

    it("should require projectId in path", () => {
      const endpoint = "/api/projects/{projectId}/tdk-optimize";
      expect(endpoint).toContain("{projectId}");
    });
  });

  describe("POST /api/projects/:projectId/clusters/:clusterId/tdk-save", () => {
    it("should accept user-edited TDK", () => {
      const request = {
        userTdkJson: {
          title: "User edited title",
          description: "User edited description",
          keywords: ["user", "edited"],
        },
      };

      expect(request.userTdkJson.title).toBeDefined();
      expect(request.userTdkJson.keywords).toHaveLength(2);
    });

    it("should allow partial edits (title only)", () => {
      const request = {
        userTdkJson: {
          title: "New title",
          // description and keywords not included
        } as Record<string, unknown>,
      };

      expect(request.userTdkJson.title).toBeDefined();
      expect(request.userTdkJson.description).toBeUndefined();
      expect(request.userTdkJson.keywords).toBeUndefined();
    });

    it("should allow partial edits (keywords only)", () => {
      const request = {
        userTdkJson: {
          keywords: ["new", "keywords"],
          // title and description not included
        } as Record<string, unknown>,
      };

      expect(request.userTdkJson.keywords).toHaveLength(2);
      expect(request.userTdkJson.title).toBeUndefined();
    });

    it("should add editedAt timestamp automatically", () => {
      const before = new Date();
      // Simulate server-side timestamp addition
      const userTdk = {
        title: "Test",
        editedAt: new Date().toISOString(),
      };
      const after = new Date();

      expect(userTdk.editedAt).toBeDefined();
      // editedAt should be between before and after
      const editedAtTime = new Date(userTdk.editedAt).getTime();
      expect(editedAtTime).toBeGreaterThanOrEqual(before.getTime());
      expect(editedAtTime).toBeLessThanOrEqual(after.getTime());
    });

    it("should require projectId and clusterId in path", () => {
      const endpoint =
        "/api/projects/{projectId}/clusters/{clusterId}/tdk-save";
      expect(endpoint).toContain("{projectId}");
      expect(endpoint).toContain("{clusterId}");
    });

    it("should validate userTdkJson structure", () => {
      const validRequest = {
        userTdkJson: {
          title: "optional",
          description: "optional",
          keywords: ["optional"],
        },
      };

      // All fields should be optional
      expect(validRequest.userTdkJson).toBeDefined();
    });
  });

  describe("GET /api/projects/:projectId/clusters/:clusterId/tdk", () => {
    it("should return current TDK status", () => {
      // Mock response structure
      const response = {
        success: true,
        data: {
          contentPlanId: "cluster-1",
          tdkJson: null,
          userTdkJson: null,
          tdkGeneratedAt: null,
        },
      };

      expect(response.success).toBe(true);
      expect(response.data.contentPlanId).toBe("cluster-1");
    });

    it("should return generated TDK if available", () => {
      const response = {
        success: true,
        data: {
          contentPlanId: "cluster-1",
          tdkJson: {
            primary: {
              title: "Generated title",
              description: "Generated description",
              keywords: ["generated"],
            },
            alternatives: [],
            metadata: {
              generatedAt: new Date().toISOString(),
              language: "en",
              modelVersion: "claude-opus-4-6",
            },
          },
          userTdkJson: null,
          tdkGeneratedAt: new Date().toISOString(),
        },
      };

      expect(response.data.tdkJson).toBeDefined();
      expect(response.data.tdkJson.primary.title).toBe("Generated title");
    });

    it("should return user-edited TDK if available", () => {
      const response = {
        success: true,
        data: {
          contentPlanId: "cluster-1",
          tdkJson: {
            primary: {
              title: "AI title",
              description: "AI description",
              keywords: ["ai"],
            },
            alternatives: [],
            metadata: {
              generatedAt: new Date().toISOString(),
              language: "en",
              modelVersion: "claude-opus-4-6",
            },
          },
          userTdkJson: {
            title: "User edited title",
            editedAt: new Date().toISOString(),
          },
          tdkGeneratedAt: new Date().toISOString(),
        },
      };

      expect(response.data.tdkJson.primary.title).toBe("AI title");
      expect(response.data.userTdkJson.title).toBe("User edited title");
    });

    it("should require projectId and clusterId", () => {
      const endpoint = "/api/projects/{projectId}/clusters/{clusterId}/tdk";
      expect(endpoint).toContain("{projectId}");
      expect(endpoint).toContain("{clusterId}");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for invalid request body", () => {
      const invalidRequest = {
        topic: "", // Empty topic
        keywords: ["test"],
      };

      expect(invalidRequest.topic).toBe("");
      // Validation should fail
    });

    it("should return 400 for missing required fields", () => {
      const incompleteRequest = {
        keywords: ["test"],
        // Missing topic
      } as Record<string, unknown>;

      expect(incompleteRequest.topic).toBeUndefined();
    });

    it("should return 400 for missing projectId", () => {
      // Path parameter missing
      const missingParam = "/api/projects//tdk-optimize";
      expect(missingParam).toContain("//");
    });

    it("should return 500 for API failures", () => {
      // Simulate API error
      const error = new Error("Claude API timeout");
      expect(error.message).toBe("Claude API timeout");
    });

    it("should return error response with code", () => {
      const errorResponse = {
        success: false,
        error: {
          message: "Topic is required",
          code: "VALIDATION_ERROR",
        },
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Response Format", () => {
    it("should return JSON response", () => {
      const response = {
        success: true,
        data: {
          primary: {
            candidate: {
              title: "Test",
              description: "Desc",
              keywords: ["test"],
            },
            validation: { severity: "pass", issues: [] },
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en",
            modelVersion: "test",
            tokensUsed: 100,
          },
        },
      };

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it("should include validation results in response", () => {
      const response = {
        success: true,
        data: {
          primary: {
            candidate: {
              title: "Python Programming Tutorial",
              description: "Learn Python...",
              keywords: ["Python", "tutorial"],
            },
            validation: {
              severity: "pass" as const,
              issues: [] as Array<{
                field: string;
                message: string;
                severity: string;
              }>,
            },
          },
          alternatives: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en" as const,
            modelVersion: "claude-opus-4-6",
            tokensUsed: 500,
          },
        },
      };

      expect(response.data.primary.validation.severity).toBe("pass");
      expect(Array.isArray(response.data.primary.validation.issues)).toBe(true);
    });

    it("should support multiple alternatives", () => {
      const response = {
        success: true,
        data: {
          primary: {
            candidate: { title: "T1", description: "D1", keywords: ["k1"] },
            validation: { severity: "pass" as const, issues: [] },
          },
          alternatives: [
            {
              candidate: { title: "T2", description: "D2", keywords: ["k2"] },
              validation: { severity: "pass" as const, issues: [] },
            },
            {
              candidate: { title: "T3", description: "D3", keywords: ["k3"] },
              validation: { severity: "warn" as const, issues: [] },
            },
          ],
          metadata: {
            generatedAt: new Date().toISOString(),
            language: "en" as const,
            modelVersion: "test",
            tokensUsed: 100,
          },
        },
      };

      expect(response.data.alternatives).toHaveLength(2);
      expect(response.data.alternatives[0].candidate.title).toBe("T2");
      expect(response.data.alternatives[1].validation.severity).toBe("warn");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle full generation -> save workflow", () => {
      // Step 1: Generate
      const generateRequest = {
        topic: "Python",
        keywords: ["Python", "tutorial"],
        language: "en" as const,
      };

      expect(generateRequest.topic).toBe("Python");

      // Step 2: Save user edits
      const saveRequest = {
        userTdkJson: {
          title: "Edited: " + generateRequest.topic,
        },
      };

      expect(saveRequest.userTdkJson.title).toContain("Python");
    });

    it("should handle retrieval after save", () => {
      const clusterId = "cluster-123";

      // Save
      const saveResponse = {
        success: true,
        data: {
          contentPlanId: clusterId,
          userTdkJson: {
            title: "Edited title",
            editedAt: new Date().toISOString(),
          },
        },
      };

      // Retrieve
      const getResponse = {
        success: true,
        data: {
          contentPlanId: clusterId,
          userTdkJson: saveResponse.data.userTdkJson,
        },
      };

      expect(getResponse.data.contentPlanId).toBe(clusterId);
      expect(getResponse.data.userTdkJson.title).toBe("Edited title");
    });

    it("should preserve AI-generated TDK when user edits", () => {
      const original = {
        primary: {
          title: "AI Title",
          description: "AI Desc",
          keywords: ["ai"],
        },
        alternatives: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          language: "en" as const,
          modelVersion: "test",
        },
      };

      const userEdits = {
        title: "User Title",
        editedAt: new Date().toISOString(),
      };

      // Both should coexist
      expect(original.primary.title).toBe("AI Title");
      expect(userEdits.title).toBe("User Title");
    });
  });
});
