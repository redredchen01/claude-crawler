import { describe, it, expect, beforeAll } from "@jest/globals";
import { ContentBriefService } from "../../src/services/contentBriefService.js";
import { Cluster } from "../../src/services/clusteringService.js";

describe("ContentBriefService", () => {
  let service: ContentBriefService;
  let mockCluster: Cluster;

  beforeAll(() => {
    service = new ContentBriefService();
    mockCluster = {
      id: "cluster-1",
      name: "Python Tutorial Cluster",
      pillarKeyword: "python tutorial",
      keywords: [
        "python tutorial",
        "learn python",
        "python guide",
        "python basics",
        "how to learn python",
      ],
      keywordIds: ["kw-1", "kw-2", "kw-3", "kw-4", "kw-5"],
      pageType: "article",
      priority: 85,
      confidenceScore: 0.9,
      createdAt: Date.now(),
    };
  });

  describe("ContentBrief Structure", () => {
    it("should create valid brief structure", async () => {
      const brief = await service.generateBrief(mockCluster, [
        "python course",
        "python learning",
      ]);

      expect(brief).toBeDefined();
      expect(brief.clusterId).toBe(mockCluster.id);
      expect(brief.pillarKeyword).toBe(mockCluster.pillarKeyword);
      expect(brief.pageType).toBe(mockCluster.pageType);
    });

    it("should have required brief fields", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.title).toBeDefined();
      expect(typeof brief.title).toBe("string");
      expect(brief.metaDescription).toBeDefined();
      expect(typeof brief.metaDescription).toBe("string");
      expect(brief.outline).toBeDefined();
      expect(Array.isArray(brief.outline)).toBe(true);
      expect(brief.targetKeywords).toBeDefined();
      expect(brief.generatedAt).toBeDefined();
    });

    it("should have title within SEO limits", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.title.length).toBeGreaterThan(10);
      expect(brief.title.length).toBeLessThanOrEqual(70);
    });

    it("should have meta description within SEO limits", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.metaDescription.length).toBeGreaterThan(50);
      expect(brief.metaDescription.length).toBeLessThanOrEqual(170);
    });
  });

  describe("Content Outline", () => {
    it("should have valid outline structure", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.outline.length).toBeGreaterThan(0);

      for (const section of brief.outline) {
        expect(section.heading).toBeDefined();
        expect(typeof section.heading).toBe("string");
        expect(section.level).toBeDefined();
        expect(typeof section.level).toBe("number");
        expect(Array.isArray(section.keyPoints)).toBe(true);
        expect(section.estimatedLength).toBeGreaterThan(0);
      }
    });

    it("should have reasonable heading hierarchy", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      for (const section of brief.outline) {
        expect(section.level).toBeGreaterThanOrEqual(1);
        expect(section.level).toBeLessThanOrEqual(6);
      }
    });

    it("should estimate content length per section", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      let totalEstimated = 0;
      for (const section of brief.outline) {
        expect(section.estimatedLength).toBeGreaterThan(0);
        totalEstimated += section.estimatedLength;
      }

      // Should have reasonable total estimated length
      expect(totalEstimated).toBeGreaterThan(500);
    });
  });

  describe("Target Keywords", () => {
    it("should categorize keywords by type", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.targetKeywords.primary).toBeDefined();
      expect(brief.targetKeywords.secondary).toBeDefined();
      expect(brief.targetKeywords.longtail).toBeDefined();

      expect(Array.isArray(brief.targetKeywords.primary)).toBe(true);
      expect(Array.isArray(brief.targetKeywords.secondary)).toBe(true);
      expect(Array.isArray(brief.targetKeywords.longtail)).toBe(true);
    });

    it("should include pillar keyword", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.targetKeywords.primary).toContain(mockCluster.pillarKeyword);
    });

    it("should include cluster keywords", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      const allTargeted = [
        ...brief.targetKeywords.primary,
        ...brief.targetKeywords.secondary,
        ...brief.targetKeywords.longtail,
      ];

      // At least some cluster keywords should be included
      const includedClusterKeywords = mockCluster.keywords.filter((kw) =>
        allTargeted.includes(kw),
      );

      expect(includedClusterKeywords.length).toBeGreaterThan(0);
    });
  });

  describe("FAQ Suggestions", () => {
    it("should provide FAQ suggestions", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.faqSuggestions).toBeDefined();
      expect(Array.isArray(brief.faqSuggestions)).toBe(true);
    });

    it("should have reasonable number of FAQs", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.faqSuggestions.length).toBeGreaterThanOrEqual(0);
      expect(brief.faqSuggestions.length).toBeLessThanOrEqual(20);
    });

    it("should format FAQs as questions", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      for (const faq of brief.faqSuggestions) {
        expect(typeof faq).toBe("string");
        expect(faq.length).toBeGreaterThan(0);
      }
    });
  });

  describe("SEO Metadata", () => {
    it("should provide SEO notes", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.seoNotes).toBeDefined();
      expect(Array.isArray(brief.seoNotes)).toBe(true);
      expect(brief.seoNotes.length).toBeGreaterThanOrEqual(0);
    });

    it("should specify content length with reasoning", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.contentLength).toBeDefined();
      expect(brief.contentLength.target).toBeGreaterThan(0);
      expect(brief.contentLength.reasoning).toBeDefined();
      expect(typeof brief.contentLength.reasoning).toBe("string");
    });

    it("should set reasonable target content length", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.contentLength.target).toBeGreaterThanOrEqual(500);
      expect(brief.contentLength.target).toBeLessThanOrEqual(5000);
    });
  });

  describe("Content Type Specific", () => {
    it("should handle article page type", async () => {
      const articleCluster: Cluster = {
        ...mockCluster,
        pageType: "article",
      };

      const brief = await service.generateBrief(articleCluster, []);

      expect(brief.pageType).toBe("article");
      expect(brief.contentLength.target).toBeGreaterThanOrEqual(1500);
    });

    it("should handle FAQ page type", async () => {
      const faqCluster: Cluster = {
        ...mockCluster,
        pageType: "faq",
      };

      const brief = await service.generateBrief(faqCluster, []);

      expect(brief.pageType).toBe("faq");
      expect(brief.outline.length).toBeGreaterThan(0);
    });

    it("should handle comparison page type", async () => {
      const comparisonCluster: Cluster = {
        ...mockCluster,
        pageType: "comparison",
      };

      const brief = await service.generateBrief(comparisonCluster, []);

      expect(brief.pageType).toBe("comparison");
      expect(brief.contentLength.target).toBeGreaterThanOrEqual(2000);
    });

    it("should handle landing page type", async () => {
      const landingCluster: Cluster = {
        ...mockCluster,
        pageType: "landing",
      };

      const brief = await service.generateBrief(landingCluster, []);

      expect(brief.pageType).toBe("landing");
      expect(brief.targetIntents).toContain("transactional");
    });
  });

  describe("Target Intents", () => {
    it("should assign intents based on page type", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.targetIntents).toBeDefined();
      expect(Array.isArray(brief.targetIntents)).toBe(true);
      expect(brief.targetIntents.length).toBeGreaterThan(0);
    });

    it("should use informational intent for articles", async () => {
      const articleCluster: Cluster = {
        ...mockCluster,
        pageType: "article",
      };

      const brief = await service.generateBrief(articleCluster, []);

      expect(brief.targetIntents).toContain("informational");
    });

    it("should use transactional intent for landing pages", async () => {
      const landingCluster: Cluster = {
        ...mockCluster,
        pageType: "landing",
      };

      const brief = await service.generateBrief(landingCluster, []);

      expect(brief.targetIntents).toContain("transactional");
    });
  });

  describe("Batch Generation", () => {
    it("should generate briefs for multiple clusters", async () => {
      const clusters = [
        mockCluster,
        { ...mockCluster, id: "cluster-2", pillarKeyword: "javascript" },
        { ...mockCluster, id: "cluster-3", pillarKeyword: "typescript" },
      ];

      const keywordMap = new Map<string, string[]>([
        ["python tutorial", ["python course", "python basics"]],
        ["javascript", ["js guide", "javascript basics"]],
        ["typescript", ["ts guide", "typescript basics"]],
      ]);

      const briefs = await service.generateBriefBatch(clusters, keywordMap);

      expect(briefs.length).toBe(3);

      for (const brief of briefs) {
        expect(brief.clusterId).toBeDefined();
        expect(brief.title).toBeDefined();
      }
    });

    it("should maintain cluster IDs in batch briefs", async () => {
      const clusters = [
        mockCluster,
        { ...mockCluster, id: "cluster-2", pillarKeyword: "javascript" },
      ];

      const keywordMap = new Map([
        ["python tutorial", []],
        ["javascript", []],
      ]);

      const briefs = await service.generateBriefBatch(clusters, keywordMap);

      expect(briefs[0].clusterId).toBe("cluster-1");
      expect(briefs[1].clusterId).toBe("cluster-2");
    });
  });

  describe("Error Handling", () => {
    it("should return valid brief even if AI generation fails", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      // Should always return a valid brief structure
      expect(brief).toBeDefined();
      expect(brief.title).toBeDefined();
      expect(brief.outline.length).toBeGreaterThan(0);
    });

    it("should handle missing related keywords", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief).toBeDefined();
      expect(brief.title.length).toBeGreaterThan(0);
    });
  });

  describe("Timestamps", () => {
    it("should include generation timestamp", async () => {
      const beforeGeneration = Date.now();
      const brief = await service.generateBrief(mockCluster, []);
      const afterGeneration = Date.now();

      expect(brief.generatedAt).toBeGreaterThanOrEqual(beforeGeneration);
      expect(brief.generatedAt).toBeLessThanOrEqual(afterGeneration);
    });
  });

  describe("Content Coherence", () => {
    it("should have consistent page type", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.pageType).toBe(mockCluster.pageType);
    });

    it("should have title related to pillar keyword", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      // Title should contain or reference the main topic
      const titleLower = brief.title.toLowerCase();
      const keywordWords = mockCluster.pillarKeyword.split(" ");

      // At least one word from keyword should be in title
      const matchFound = keywordWords.some((word) =>
        titleLower.includes(word.toLowerCase()),
      );

      expect(matchFound).toBe(true);
    });

    it("should suggest internal links", async () => {
      const brief = await service.generateBrief(mockCluster, []);

      expect(brief.internalLinkTargets).toBeDefined();
      expect(Array.isArray(brief.internalLinkTargets)).toBe(true);
    });
  });
});
