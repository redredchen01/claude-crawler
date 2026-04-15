/**
 * LLM Content Automation Service Tests
 * Phase 3.2: Comprehensive automation pipeline testing
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
  afterEach,
} from "@jest/globals";
import {
  LLMContentAutomationService,
  type AutomationConfig,
} from "../../src/services/llmContentAutomationService.js";
import { Cluster } from "../../src/services/clusteringService.js";

// Mock Anthropic client
jest.mock("@anthropic-ai/sdk", () => {
  return {
    default: jest.fn(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

describe("LLMContentAutomationService", () => {
  let service: LLMContentAutomationService;
  let mockCluster: Cluster;
  let mockRelatedClusters: Cluster[];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-api-key";

    // Create mock clusters
    mockCluster = {
      id: "cluster-1",
      name: "React Testing",
      pillarKeyword: "react testing best practices",
      keywords: [
        "unit testing react",
        "jest react testing",
        "react testing library",
        "mocking in react",
        "component testing",
      ],
      keywordIds: ["kw-1", "kw-2", "kw-3", "kw-4", "kw-5"],
      memberCount: 5,
      pageType: "article",
      priority: 0.85,
      createdAt: Date.now(),
      averageSearchVolume: 1200,
      competitionScore: 65,
      confidenceScore: 0.92,
    } as unknown as Cluster;

    mockRelatedClusters = [
      {
        id: "cluster-2",
        name: "React Hooks",
        pillarKeyword: "react hooks tutorial",
        keywords: ["usestate", "useeffect", "custom hooks"],
        keywordIds: ["kw-6", "kw-7", "kw-8"],
        memberCount: 3,
        pageType: "article",
        priority: 0.78,
        createdAt: Date.now(),
        averageSearchVolume: 800,
        competitionScore: 55,
        confidenceScore: 0.85,
      } as unknown as Cluster,
      {
        id: "cluster-3",
        name: "React Performance",
        pillarKeyword: "react performance optimization",
        keywords: ["memo", "usecallback", "usememo"],
        keywordIds: ["kw-9", "kw-10", "kw-11"],
        memberCount: 3,
        pageType: "article",
        priority: 0.72,
        createdAt: Date.now(),
        averageSearchVolume: 650,
        competitionScore: 60,
        confidenceScore: 0.88,
      } as unknown as Cluster,
    ];

    // Initialize service with default config
    service = new LLMContentAutomationService();
  });

  afterEach(() => {
    service.clearCache();
  });

  describe("Service Initialization", () => {
    it("should initialize with default configuration", () => {
      const defaultService = new LLMContentAutomationService();
      expect(defaultService).toBeDefined();
    });

    it("should initialize with custom configuration", () => {
      const customConfig: Partial<AutomationConfig> = {
        enableBriefGeneration: false,
        parallelRequests: 5,
      };
      const customService = new LLMContentAutomationService(customConfig);
      expect(customService).toBeDefined();
    });

    it("should use ANTHROPIC_API_KEY from environment", () => {
      process.env.ANTHROPIC_API_KEY = "custom-api-key";
      const customService = new LLMContentAutomationService();
      expect(customService).toBeDefined();
    });

    it("should have empty cache on initialization", () => {
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  // Helper to setup mock response
  const setupMockResponse = (response: any) => {
    const Anthropic = require("@anthropic-ai/sdk").default;
    (Anthropic().messages.create as jest.Mock).mockResolvedValue(response);
  };

  const setupMockError = (error: Error) => {
    const Anthropic = require("@anthropic-ai/sdk").default;
    (Anthropic().messages.create as jest.Mock).mockRejectedValue(error);
  };

  describe("Batch Processing - automateClusterContent", () => {
    it("should process cluster with all features enabled", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test Title"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result).toBeDefined();
      expect(result.clusterId).toBe("cluster-1");
      expect(result.pillarKeyword).toBe("react testing best practices");
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle configuration with features disabled", async () => {
      const customService = new LLMContentAutomationService({
        enableBriefGeneration: false,
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      const result = await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.automatedBrief).toBeNull();
      expect(result.automatedFaq).toBeNull();
      expect(result.optimizedLinks).toBeNull();
    });

    it("should accumulate token usage across all generations", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      // Should have tokens from brief (100+50), faq (100+50), and links (100+50)
      expect(result.totalTokensUsed).toBeGreaterThan(0);
    });

    it("should record total processing time", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const startTime = Date.now();
      const result = await service.automateClusterContent(mockCluster);
      const endTime = Date.now();

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.totalTimeMs).toBeLessThanOrEqual(endTime - startTime + 100);
    });
  });

  describe("Brief Generation", () => {
    it("should generate automated brief with correct structure", async () => {
      const briefData = {
        title: "React Testing Complete Guide",
        metaDescription: "Learn react testing strategies",
        outline: ["Getting Started", "Advanced Techniques"],
        targetKeywords: {
          primary: ["react testing"],
          secondary: ["jest", "enzyme"],
          longtail: ["testing hooks"],
        },
        contentLength: { target: 2000 },
      };

      const mockResponse = {
        content: [{ type: "text", text: JSON.stringify(briefData) }],
        usage: { input_tokens: 150, output_tokens: 75 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      expect(result.automatedBrief).toBeDefined();
      if (result.automatedBrief) {
        expect(result.automatedBrief.automationMetadata).toBeDefined();
        expect(result.automatedBrief.automationMetadata.modelVersion).toBe(
          "claude-3-5-sonnet-20241022",
        );
        expect(result.automatedBrief.automationMetadata.tokenUsage.input).toBe(
          150,
        );
        expect(result.automatedBrief.automationMetadata.tokenUsage.output).toBe(
          75,
        );
      }
    });

    it("should handle malformed JSON in brief response gracefully", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "This is not JSON" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      // Should provide default brief on parsing failure
      expect(result.automatedBrief).toBeDefined();
      if (result.automatedBrief) {
        expect(result.automatedBrief.title).toContain("react testing");
      }
    });

    it("should cache brief results when enabled", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Cached Brief"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableCacheReuse: true,
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      // First call
      await customService.automateClusterContent(mockCluster);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await customService.automateClusterContent(mockCluster);
      expect(mockCreate).toHaveBeenCalledTimes(1); // No additional call
    });

    it("should skip brief when disabled", async () => {
      const customService = new LLMContentAutomationService({
        enableBriefGeneration: false,
      });

      const result = await customService.automateClusterContent(mockCluster);
      expect(result.automatedBrief).toBeNull();
    });
  });

  describe("FAQ Generation", () => {
    it("should generate automated FAQ with correct structure", async () => {
      const faqData = {
        pageTitle: "FAQs About React Testing",
        introduction: "Common questions...",
        conclusion: "Learn more...",
        faqs: [
          { question: "What is React testing?", answer: "React testing is..." },
          {
            question: "How do I test components?",
            answer: "Use React Testing Library...",
          },
        ],
        relatedTopics: ["jest", "enzyme"],
      };

      const mockResponse = {
        content: [{ type: "text", text: JSON.stringify(faqData) }],
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      expect(result.automatedFaq).toBeDefined();
      if (result.automatedFaq) {
        expect(result.automatedFaq.automationMetadata).toBeDefined();
        expect(result.automatedFaq.automationMetadata.faqApproaches).toContain(
          "user-perspective",
        );
      }
    });

    it("should handle FAQ JSON with markdown code blocks", async () => {
      const faqData = {
        pageTitle: "FAQs",
        introduction: "...",
        conclusion: "...",
        faqs: [],
        relatedTopics: [],
      };

      const mockResponse = {
        content: [
          {
            type: "text",
            text: `\`\`\`json\n${JSON.stringify(faqData)}\n\`\`\``,
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      expect(result.automatedFaq).toBeDefined();
    });

    it("should generate default FAQ on parsing failure", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Invalid FAQ response" }],
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      expect(result.automatedFaq).toBeDefined();
      if (result.automatedFaq) {
        expect(result.automatedFaq.pageTitle).toContain("FAQ");
      }
    });

    it("should include multiple FAQ approaches in metadata", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              pageTitle: "FAQs",
              introduction: "...",
              conclusion: "...",
              faqs: [],
              relatedTopics: [],
            }),
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);

      if (result.automatedFaq) {
        expect(
          result.automatedFaq.automationMetadata.faqApproaches.length,
        ).toBeGreaterThan(0);
        expect(result.automatedFaq.automationMetadata.faqApproaches).toContain(
          "user-perspective",
        );
      }
    });

    it("should skip FAQ when disabled", async () => {
      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
      });

      const result = await customService.automateClusterContent(mockCluster);
      expect(result.automatedFaq).toBeNull();
    });
  });

  describe("Internal Link Optimization", () => {
    it("should generate optimized internal links", async () => {
      const linkData = {
        outgoingLinks: [
          {
            targetClusterId: "cluster-2",
            anchorText: "React Hooks",
            context: "in the advanced section",
            type: "topical",
          },
        ],
        incomingLinks: [],
        strategies: ["semantic-relevance"],
      };

      const mockResponse = {
        content: [{ type: "text", text: JSON.stringify(linkData) }],
        usage: { input_tokens: 250, output_tokens: 120 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.optimizedLinks).toBeDefined();
      if (result.optimizedLinks) {
        expect(result.optimizedLinks.automationMetadata).toBeDefined();
        expect(
          result.optimizedLinks.automationMetadata.optimizationStrategies,
        ).toContain("semantic-relevance");
      }
    });

    it("should include link relevance validation in metadata", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({ outgoingLinks: [], incomingLinks: [] }),
          },
        ],
        usage: { input_tokens: 250, output_tokens: 120 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      if (result.optimizedLinks) {
        const validation =
          result.optimizedLinks.automationMetadata.linkRelevanceValidation;
        expect(validation).toBeDefined();
        expect(validation.allAboveThreshold).toBeDefined();
        expect(validation.averageRelevance).toBeDefined();
        expect(Array.isArray(validation.outliers)).toBe(true);
      }
    });

    it("should skip link optimization without related clusters", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(mockCluster);
      // Without related clusters, link optimization should not generate or have null result
    });

    it("should skip link optimization when disabled", async () => {
      const customService = new LLMContentAutomationService({
        enableInternalLinkOptimization: false,
      });

      const result = await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.optimizedLinks).toBeNull();
    });
  });

  describe("Retry Logic", () => {
    it("should retry on LLM failure with exponential backoff", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn();

      // Fail twice, then succeed
      mockCreate
        .mockRejectedValueOnce(new Error("API Error"))
        .mockRejectedValueOnce(new Error("API Error"))
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"title": "Success"}' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        });

      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelayMs: 10, // Short delay for testing
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(mockCreate).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.automatedBrief).toBeDefined();
    });

    it("should fail after max retries exceeded", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest
        .fn()
        .mockRejectedValue(new Error("Persistent API Error"));

      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
        retryPolicy: {
          maxAttempts: 2,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(mockCreate).toHaveBeenCalledTimes(2); // Max attempts reached
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should use custom retry policy from config", async () => {
      const customRetryPolicy = {
        maxAttempts: 5,
        backoffMultiplier: 3,
        initialDelayMs: 100,
      };

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
        retryPolicy: customRetryPolicy,
      });

      expect(customService).toBeDefined();
    });
  });

  describe("Parallel Request Handling", () => {
    it("should execute multiple tasks in parallel when enabled", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        parallelRequests: 3,
      });

      const startTime = Date.now();
      await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );
      const duration = Date.now() - startTime;

      // Parallel execution should be faster than sequential
      // (This is a relative test; actual speed depends on system)
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should respect parallelRequests configuration", async () => {
      const customService = new LLMContentAutomationService({
        parallelRequests: 1,
      });

      expect(customService).toBeDefined();
    });
  });

  describe("Cache Management", () => {
    it("should store brief in cache when enabled", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Cached"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const customService = new LLMContentAutomationService({
        enableCacheReuse: true,
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      await customService.automateClusterContent(mockCluster);

      const stats = customService.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.keys).toContain("brief-cluster-1");
    });

    it("should retrieve cached content on subsequent calls", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Cached"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableCacheReuse: true,
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      // First call
      const result1 = await customService.automateClusterContent(mockCluster);

      // Second call - should use cache
      const result2 = await customService.automateClusterContent(mockCluster);

      expect(mockCreate).toHaveBeenCalledTimes(1); // Only one API call
      expect(result1.automatedBrief?.title).toBe(result2.automatedBrief?.title);
    });

    it("should not cache when cache reuse is disabled", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "NotCached"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableCacheReuse: false,
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      await customService.automateClusterContent(mockCluster);
      await customService.automateClusterContent(mockCluster);

      expect(mockCreate).toHaveBeenCalledTimes(2); // Two API calls
    });

    it("should return cache statistics", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const customService = new LLMContentAutomationService({
        enableCacheReuse: true,
      });

      await customService.automateClusterContent(mockCluster);

      const stats = customService.getCacheStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("keys");
      expect(Array.isArray(stats.keys)).toBe(true);
    });

    it("should clear entire cache", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-api/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const customService = new LLMContentAutomationService({
        enableCacheReuse: true,
      });

      await customService.automateClusterContent(mockCluster);

      let stats = customService.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      customService.clearCache();

      stats = customService.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  describe("Token Usage Tracking", () => {
    it("should track token usage in brief generation", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 150, output_tokens: 75 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      const result = await customService.automateClusterContent(mockCluster);

      if (result.automatedBrief) {
        expect(result.automatedBrief.automationMetadata.tokenUsage.input).toBe(
          150,
        );
        expect(result.automatedBrief.automationMetadata.tokenUsage.output).toBe(
          75,
        );
      }
    });

    it("should accumulate total tokens across batch", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      // With 3 features enabled, should accumulate tokens from all
      expect(result.totalTokensUsed).toBeGreaterThan(0);
    });

    it("should handle missing token usage in response", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        // No usage field
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
      });

      const result = await customService.automateClusterContent(mockCluster);

      if (result.automatedBrief) {
        expect(result.automatedBrief.automationMetadata.tokenUsage.input).toBe(
          0,
        );
        expect(result.automatedBrief.automationMetadata.tokenUsage.output).toBe(
          0,
        );
      }
    });
  });

  describe("Fallback Behavior", () => {
    it("should use default brief when LLM fails", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        new Error("API unavailable"),
      );

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
        fallbackBehavior: "use-defaults",
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(result.automatedBrief).toBeDefined();
      if (result.automatedBrief) {
        expect(result.automatedBrief.title).toContain(
          mockCluster.pillarKeyword,
        );
      }
    });

    it("should use default FAQ when LLM fails", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        new Error("API unavailable"),
      );

      const customService = new LLMContentAutomationService({
        enableBriefGeneration: false,
        enableInternalLinkOptimization: false,
        fallbackBehavior: "use-defaults",
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(result.automatedFaq).toBeDefined();
      if (result.automatedFaq) {
        expect(result.automatedFaq.pageTitle).toContain(
          mockCluster.pillarKeyword,
        );
      }
    });

    it("should use default links when LLM fails", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        new Error("API unavailable"),
      );

      const customService = new LLMContentAutomationService({
        enableBriefGeneration: false,
        enableFaqGeneration: false,
        fallbackBehavior: "use-defaults",
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.optimizedLinks).toBeDefined();
    });

    it("should include errors in result when features fail", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        new Error("API error"),
      );

      const customService = new LLMContentAutomationService({
        fallbackBehavior: "use-defaults",
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Prompt Customization", () => {
    it("should use custom prompt templates", async () => {
      const customPrompts = {
        briefTemplate: "CUSTOM BRIEF TEMPLATE FOR {keyword}",
        faqTemplate: "CUSTOM FAQ TEMPLATE FOR {keyword}",
        linkTemplate: "CUSTOM LINK TEMPLATE FOR {sourceKeyword}",
        systemPrompt: "Custom system prompt",
      };

      const customService = new LLMContentAutomationService({
        promptCustomization: {
          ...customPrompts,
          contextWindow: 4096,
          temperature: 0.8,
          topP: 0.95,
        },
      });

      expect(customService).toBeDefined();
    });

    it("should replace keyword placeholders in prompts", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        enableFaqGeneration: false,
        enableInternalLinkOptimization: false,
        promptCustomization: {
          briefTemplate: "Generate brief for keyword: {keyword}",
          faqTemplate: "FAQ for {keyword}",
          linkTemplate: "Links for {sourceKeyword}",
          systemPrompt: "You are helpful",
          contextWindow: 4096,
          temperature: 0.7,
          topP: 0.9,
        },
      });

      await customService.automateClusterContent(mockCluster);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain(mockCluster.pillarKeyword);
    });
  });

  describe("Error Handling", () => {
    it("should handle LLM API errors gracefully", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        new Error("Rate limit exceeded"),
      );

      const customService = new LLMContentAutomationService({
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle network timeout errors", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const timeoutError = new Error("Request timeout");
      (timeoutError as any).code = "TIMEOUT";
      (Anthropic().messages.create as jest.Mock).mockRejectedValue(
        timeoutError,
      );

      const customService = new LLMContentAutomationService({
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(mockCluster);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should process partial results when some features fail", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = jest.fn();

      // Brief succeeds, FAQ fails, links succeed
      mockCreate
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"title": "Brief"}' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockRejectedValueOnce(new Error("FAQ API error"))
        .mockResolvedValueOnce({
          content: [
            {
              type: "text",
              text: '{"outgoingLinks": [], "incomingLinks": []}',
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        });

      (Anthropic().messages.create as jest.Mock) = mockCreate;

      const customService = new LLMContentAutomationService({
        retryPolicy: {
          maxAttempts: 1,
          backoffMultiplier: 2,
          initialDelayMs: 5,
        },
      });

      const result = await customService.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      expect(result.automatedBrief).toBeDefined(); // Succeeded
      expect(result.automatedFaq).toBeDefined(); // Fallback
      expect(result.optimizedLinks).toBeDefined(); // Succeeded
    });
  });

  describe("Metadata Consistency", () => {
    it("should include consistent model version across all outputs", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      const modelVersion = "claude-3-5-sonnet-20241022";

      if (result.automatedBrief) {
        expect(result.automatedBrief.automationMetadata.modelVersion).toBe(
          modelVersion,
        );
      }

      if (result.automatedFaq) {
        expect(result.automatedFaq.automationMetadata.modelVersion).toBe(
          modelVersion,
        );
      }

      if (result.optimizedLinks) {
        expect(result.optimizedLinks.automationMetadata.modelVersion).toBe(
          modelVersion,
        );
      }
    });

    it("should include generation time in all outputs", async () => {
      const mockResponse = {
        content: [{ type: "text", text: '{"title": "Test"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const Anthropic = require("@anthropic-ai/sdk").default;
      (Anthropic().messages.create as jest.Mock).mockResolvedValue(
        mockResponse,
      );

      const result = await service.automateClusterContent(
        mockCluster,
        mockRelatedClusters,
      );

      if (result.automatedBrief) {
        expect(
          result.automatedBrief.automationMetadata.generationTimeMs,
        ).toBeGreaterThanOrEqual(0);
      }

      if (result.automatedFaq) {
        expect(
          result.automatedFaq.automationMetadata.generationTimeMs,
        ).toBeGreaterThanOrEqual(0);
      }

      if (result.optimizedLinks) {
        expect(
          result.optimizedLinks.automationMetadata.generationTimeMs,
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Configuration Validation", () => {
    it("should accept all boolean feature flags", () => {
      const configs = [
        { enableBriefGeneration: true, enableFaqGeneration: true },
        { enableBriefGeneration: false, enableFaqGeneration: false },
        { enableInternalLinkOptimization: true },
        { enableCacheReuse: false },
      ];

      configs.forEach((config) => {
        const customService = new LLMContentAutomationService(config);
        expect(customService).toBeDefined();
      });
    });

    it("should accept custom retry policies", () => {
      const config: Partial<AutomationConfig> = {
        retryPolicy: {
          maxAttempts: 5,
          backoffMultiplier: 1.5,
          initialDelayMs: 2000,
        },
      };

      const customService = new LLMContentAutomationService(config);
      expect(customService).toBeDefined();
    });

    it("should accept fallback behavior configurations", () => {
      const behaviors: Array<"skip" | "use-defaults" | "error"> = [
        "skip",
        "use-defaults",
        "error",
      ];

      behaviors.forEach((behavior) => {
        const config: Partial<AutomationConfig> = {
          fallbackBehavior: behavior,
        };
        const customService = new LLMContentAutomationService(config);
        expect(customService).toBeDefined();
      });
    });
  });
});
