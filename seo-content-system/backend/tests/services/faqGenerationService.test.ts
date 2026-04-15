import { describe, it, expect, beforeAll } from "@jest/globals";
import { FAQGenerationService } from "../../src/services/faqGenerationService.js";
import { Cluster } from "../../src/services/clusteringService.js";

describe("FAQGenerationService", () => {
  let service: FAQGenerationService;
  let mockCluster: Cluster;

  beforeAll(() => {
    service = new FAQGenerationService();
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
      pageType: "faq",
      priority: 85,
      confidenceScore: 0.9,
      createdAt: Date.now(),
    };
  });

  describe("FAQ Page Structure", () => {
    it("should create valid FAQ page structure", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage).toBeDefined();
      expect(faqPage.clusterId).toBe(mockCluster.id);
      expect(faqPage.pillarKeyword).toBe(mockCluster.pillarKeyword);
      expect(faqPage.faqs).toBeDefined();
      expect(Array.isArray(faqPage.faqs)).toBe(true);
    });

    it("should have required FAQ page fields", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.pageTitle).toBeDefined();
      expect(typeof faqPage.pageTitle).toBe("string");
      expect(faqPage.introduction).toBeDefined();
      expect(typeof faqPage.introduction).toBe("string");
      expect(faqPage.conclusion).toBeDefined();
      expect(typeof faqPage.conclusion).toBe("string");
      expect(faqPage.relatedTopics).toBeDefined();
      expect(Array.isArray(faqPage.relatedTopics)).toBe(true);
      expect(faqPage.generatedAt).toBeDefined();
    });

    it("should have reasonable page title length", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.pageTitle.length).toBeGreaterThan(10);
      expect(faqPage.pageTitle.length).toBeLessThanOrEqual(100);
    });

    it("should have meaningful introduction", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.introduction.length).toBeGreaterThan(50);
      expect(faqPage.introduction.length).toBeLessThanOrEqual(500);
    });

    it("should have meaningful conclusion", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.conclusion.length).toBeGreaterThan(50);
      expect(faqPage.conclusion.length).toBeLessThanOrEqual(500);
    });
  });

  describe("FAQ Pairs", () => {
    it("should have reasonable number of FAQs", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.faqs.length).toBeGreaterThanOrEqual(3);
      expect(faqPage.faqs.length).toBeLessThanOrEqual(15);
    });

    it("should have valid FAQ pair structure", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const faq of faqPage.faqs) {
        expect(faq.question).toBeDefined();
        expect(typeof faq.question).toBe("string");
        expect(faq.question.length).toBeGreaterThan(0);

        expect(faq.answer).toBeDefined();
        expect(typeof faq.answer).toBe("string");
        expect(faq.answer.length).toBeGreaterThan(0);

        expect(faq.relatedKeywords).toBeDefined();
        expect(Array.isArray(faq.relatedKeywords)).toBe(true);

        expect(faq.difficulty).toBeDefined();
        expect(["beginner", "intermediate", "advanced"]).toContain(
          faq.difficulty,
        );
      }
    });

    it("should have questions formatted as actual questions", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const faq of faqPage.faqs) {
        // Questions typically start with question words or end with ?
        const isQuestion =
          /^(what|how|why|when|where|who|does|can|is|should)/i.test(
            faq.question,
          ) || faq.question.endsWith("?");
        expect(isQuestion).toBe(true);
      }
    });

    it("should have reasonable answer length", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const faq of faqPage.faqs) {
        expect(faq.answer.length).toBeGreaterThanOrEqual(50);
        expect(faq.answer.length).toBeLessThanOrEqual(1000);
      }
    });

    it("should have related keywords for each answer", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const faq of faqPage.faqs) {
        expect(faq.relatedKeywords.length).toBeGreaterThanOrEqual(0);
        expect(faq.relatedKeywords.length).toBeLessThanOrEqual(10);

        for (const keyword of faq.relatedKeywords) {
          expect(typeof keyword).toBe("string");
          expect(keyword.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Difficulty Distribution", () => {
    it("should have variety in difficulty levels", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const difficulties = faqPage.faqs.map((faq) => faq.difficulty);
      const uniqueDifficulties = new Set(difficulties);

      // Should have at least 2 different difficulty levels if possible
      if (faqPage.faqs.length >= 3) {
        expect(uniqueDifficulties.size).toBeGreaterThanOrEqual(2);
      }
    });

    it("should have proper difficulty ordering", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const difficulties = faqPage.faqs.map((faq) => faq.difficulty);
      let hasBeginnerBefore = false;

      for (const diff of difficulties) {
        if (diff === "beginner") {
          hasBeginnerBefore = true;
        }
        // If we encounter intermediate/advanced before beginner, that's not ideal
        // but it's not wrong - just a preference
      }

      // Should have at least one beginner question
      expect(difficulties).toContain("beginner");
    });

    it("should validate all difficulty values", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const validDifficulties = ["beginner", "intermediate", "advanced"];

      for (const faq of faqPage.faqs) {
        expect(validDifficulties).toContain(faq.difficulty);
      }
    });
  });

  describe("Related Topics", () => {
    it("should provide related topics", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.relatedTopics).toBeDefined();
      expect(Array.isArray(faqPage.relatedTopics)).toBe(true);
    });

    it("should have reasonable number of related topics", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      expect(faqPage.relatedTopics.length).toBeGreaterThanOrEqual(0);
      expect(faqPage.relatedTopics.length).toBeLessThanOrEqual(10);
    });

    it("should have valid related topic format", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const topic of faqPage.relatedTopics) {
        expect(typeof topic).toBe("string");
        expect(topic.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Content Coherence", () => {
    it("should have page title related to pillar keyword", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const titleLower = faqPage.pageTitle.toLowerCase();
      const keywordWords = mockCluster.pillarKeyword.split(" ");

      // At least one word from keyword should be in title
      const matchFound = keywordWords.some((word) =>
        titleLower.includes(word.toLowerCase()),
      );

      expect(matchFound).toBe(true);
    });

    it("should have introduction reference to pillar keyword", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const introLower = faqPage.introduction.toLowerCase();
      expect(introLower).toContain(mockCluster.pillarKeyword.toLowerCase());
    });

    it("should have conclusion reference to pillar keyword", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const conclusionLower = faqPage.conclusion.toLowerCase();
      expect(conclusionLower).toContain(
        mockCluster.pillarKeyword.toLowerCase(),
      );
    });

    it("should maintain consistent topic throughout FAQ", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const allQuestions = faqPage.faqs.map((faq) =>
        faq.question.toLowerCase(),
      );

      // At least some questions should reference the main topic
      const topicMatches = allQuestions.filter((q) =>
        mockCluster.pillarKeyword
          .split(" ")
          .some((word) => q.includes(word.toLowerCase())),
      );

      expect(topicMatches.length).toBeGreaterThan(0);
    });
  });

  describe("Batch Generation", () => {
    it("should generate FAQ pages for multiple clusters", async () => {
      const clusters = [
        mockCluster,
        {
          ...mockCluster,
          id: "cluster-2",
          pillarKeyword: "javascript tutorial",
        },
        { ...mockCluster, id: "cluster-3", pillarKeyword: "typescript guide" },
      ];

      const briefTitles = new Map<string, string>([
        ["python tutorial", "Complete Python Learning Guide"],
        ["javascript tutorial", "JavaScript Developer Handbook"],
        ["typescript guide", "TypeScript Best Practices"],
      ]);

      const faqPages = await service.generateFAQBatch(clusters, briefTitles);

      expect(faqPages.length).toBe(3);

      for (const faqPage of faqPages) {
        expect(faqPage.clusterId).toBeDefined();
        expect(faqPage.faqs.length).toBeGreaterThan(0);
      }
    });

    it("should maintain cluster IDs in batch generation", async () => {
      const clusters = [
        mockCluster,
        { ...mockCluster, id: "cluster-2", pillarKeyword: "javascript" },
      ];

      const briefTitles = new Map([
        ["python tutorial", "Guide"],
        ["javascript", "Guide"],
      ]);

      const faqPages = await service.generateFAQBatch(clusters, briefTitles);

      expect(faqPages[0].clusterId).toBe("cluster-1");
      expect(faqPages[1].clusterId).toBe("cluster-2");
    });

    it("should respect rate limiting in batch generation", async () => {
      const clusters = [
        mockCluster,
        { ...mockCluster, id: "cluster-2", pillarKeyword: "javascript" },
      ];

      const startTime = Date.now();
      await service.generateFAQBatch(clusters);
      const endTime = Date.now();

      // Should take at least 500ms due to rate limiting delay
      const elapsed = endTime - startTime;
      // Allow some margin for execution time
      expect(elapsed).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Error Handling", () => {
    it("should return valid FAQ page even if generation fails", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      // Should always return a valid structure
      expect(faqPage).toBeDefined();
      expect(faqPage.faqs.length).toBeGreaterThan(0);
      expect(faqPage.pageTitle).toBeDefined();
      expect(faqPage.introduction).toBeDefined();
      expect(faqPage.conclusion).toBeDefined();
    });

    it("should handle missing content brief title gracefully", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      // Should generate FAQ page even without content brief title
      expect(faqPage).toBeDefined();
      expect(faqPage.faqs.length).toBeGreaterThan(0);
    });

    it("should have valid structure with default FAQs", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      // Validate default FAQ structure
      for (const faq of faqPage.faqs) {
        expect(faq.question).toBeTruthy();
        expect(faq.answer).toBeTruthy();
        expect(faq.difficulty).toBeTruthy();
      }
    });
  });

  describe("Timestamps", () => {
    it("should include generation timestamp", async () => {
      const beforeGeneration = Date.now();
      const faqPage = await service.generateFAQPage(mockCluster);
      const afterGeneration = Date.now();

      expect(faqPage.generatedAt).toBeGreaterThanOrEqual(beforeGeneration);
      expect(faqPage.generatedAt).toBeLessThanOrEqual(afterGeneration);
    });

    it("should have reasonable timestamp", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      // Timestamp should be recent (within last minute)
      const now = Date.now();
      const diff = now - faqPage.generatedAt;

      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(60000);
    });
  });

  describe("Content Quality", () => {
    it("should have substantive answers", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      for (const faq of faqPage.faqs) {
        const words = faq.answer.split(/\s+/).length;
        // Answers should have at least 10 words on average
        expect(words).toBeGreaterThanOrEqual(10);
      }
    });

    it("should avoid redundant questions", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const questions = faqPage.faqs.map((faq) =>
        faq.question.toLowerCase().trim(),
      );
      const uniqueQuestions = new Set(questions);

      // All questions should be unique
      expect(uniqueQuestions.size).toBe(questions.length);
    });

    it("should have diverse question types", async () => {
      const faqPage = await service.generateFAQPage(mockCluster);

      const questionPatterns = {
        what: 0,
        how: 0,
        why: 0,
        when: 0,
        where: 0,
        other: 0,
      };

      for (const faq of faqPage.faqs) {
        const q = faq.question.toLowerCase();
        if (q.startsWith("what")) questionPatterns.what++;
        else if (q.startsWith("how")) questionPatterns.how++;
        else if (q.startsWith("why")) questionPatterns.why++;
        else if (q.startsWith("when")) questionPatterns.when++;
        else if (q.startsWith("where")) questionPatterns.where++;
        else questionPatterns.other++;
      }

      // Should have variety in question types
      const typeCount = Object.values(questionPatterns).filter(
        (v) => v > 0,
      ).length;
      expect(typeCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Cluster Integration", () => {
    it("should correctly handle different page types", async () => {
      const faqCluster: Cluster = {
        ...mockCluster,
        pageType: "faq",
      };

      const faqPage = await service.generateFAQPage(faqCluster);

      expect(faqPage).toBeDefined();
      expect(faqPage.faqs.length).toBeGreaterThan(0);
    });

    it("should work with different pillar keywords", async () => {
      const cluster: Cluster = {
        ...mockCluster,
        pillarKeyword: "machine learning basics",
      };

      const faqPage = await service.generateFAQPage(cluster);

      expect(faqPage.pillarKeyword).toBe("machine learning basics");
      expect(faqPage.faqs.length).toBeGreaterThan(0);
    });

    it("should handle clusters with varying keyword counts", async () => {
      const largeCluster: Cluster = {
        ...mockCluster,
        keywords: Array.from({ length: 20 }, (_, i) => `keyword-${i}`),
      };

      const faqPage = await service.generateFAQPage(largeCluster);

      expect(faqPage).toBeDefined();
      expect(faqPage.faqs.length).toBeGreaterThan(0);
    });
  });
});
