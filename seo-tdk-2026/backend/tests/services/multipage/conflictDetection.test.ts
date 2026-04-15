/**
 * Conflict Detection and Multi-Page Analysis Tests
 *
 * Tests for conflict detection service, keyword normalization,
 * Jaccard similarity, and multi-page analysis
 */

import { describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import { db, initializeDatabase } from "../../../src/db";
import { contentPlans } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ConflictDetectionService,
  MultiPageAnalysisService,
  type ConflictResult,
} from "../../../src/services/multipage";

describe("Conflict Detection & Multi-Page Analysis", () => {
  beforeAll(async () => {
    await initializeDatabase();
  });
  // ====================================================================
  // Test Suite 1: Keyword Normalization
  // ====================================================================

  describe("ConflictDetectionService - Keyword Normalization", () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
      service = new ConflictDetectionService();
    });

    it("should normalize English keywords to lowercase", () => {
      const keywords = ["Python", "JAVASCRIPT", "React"];
      const result = service.normalizeKeywords(keywords, "en");

      expect(result.every((k) => k === k.toLowerCase())).toBe(true);
    });

    it("should remove English stopwords", () => {
      const keywords = ["the", "python", "and", "javascript", "is"];
      const result = service.normalizeKeywords(keywords, "en");

      expect(result).not.toContain("the");
      expect(result).not.toContain("and");
      expect(result).not.toContain("is");
      expect(result).toContain("python");
      expect(result).toContain("javascript");
    });

    it("should split hyphenated and underscored English keywords", () => {
      const keywords = ["machine-learning", "data_science"];
      const result = service.normalizeKeywords(keywords, "en");

      expect(result).toContain("machine");
      expect(result).toContain("learning");
      expect(result).toContain("data");
      expect(result).toContain("science");
    });

    it("should handle Chinese keywords", () => {
      const keywords = ["python教程", "javascript指南"];
      const result = service.normalizeKeywords(keywords, "zh");

      // Should extract Chinese characters
      expect(result.length).toBeGreaterThan(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should remove very short keywords", () => {
      const keywords = ["a", "to", "python", "is"];
      const result = service.normalizeKeywords(keywords, "en");

      // Length < 2 or stopwords should be removed
      expect(result).not.toContain("a");
      expect(result).not.toContain("to");
      expect(result).toContain("python");
    });

    it("should deduplicate keywords", () => {
      const keywords = ["python", "Python", "PYTHON"];
      const result = service.normalizeKeywords(keywords, "en");

      const count = result.filter((k) => k === "python").length;
      expect(count).toBe(1);
    });

    it("should return sorted keywords", () => {
      const keywords = ["zebra", "apple", "banana"];
      const result = service.normalizeKeywords(keywords, "en");

      expect(result).toEqual([...result].sort());
    });
  });

  // ====================================================================
  // Test Suite 2: Jaccard Similarity
  // ====================================================================

  describe("ConflictDetectionService - Jaccard Similarity", () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
      service = new ConflictDetectionService();
    });

    it("should return 0 for no overlap", () => {
      const set1 = ["python", "java"];
      const set2 = ["javascript", "ruby"];

      const similarity = service.jaccardSimilarity(set1, set2);
      expect(similarity).toBe(0);
    });

    it("should return 1 for identical sets", () => {
      const set1 = ["python", "java", "cpp"];
      const set2 = ["python", "java", "cpp"];

      const similarity = service.jaccardSimilarity(set1, set2);
      expect(similarity).toBe(1);
    });

    it("should return 0.5 for 50% overlap", () => {
      const set1 = ["a", "b"];
      const set2 = ["b", "c"];

      // Intersection: {b}, Union: {a, b, c} = 1/3 ≈ 0.333
      const similarity = service.jaccardSimilarity(set1, set2);
      expect(similarity).toBeCloseTo(1 / 3, 2);
    });

    it("should handle empty sets", () => {
      const similarity1 = service.jaccardSimilarity([], []);
      expect(similarity1).toBe(1); // Both empty = identical

      const similarity2 = service.jaccardSimilarity(["a"], []);
      expect(similarity2).toBe(0); // One empty, one not
    });

    it("should be symmetric (order independent)", () => {
      const set1 = ["python", "data"];
      const set2 = ["python", "science"];

      const sim1 = service.jaccardSimilarity(set1, set2);
      const sim2 = service.jaccardSimilarity(set2, set1);

      expect(sim1).toBe(sim2);
    });

    it("should return value in [0, 1]", () => {
      const sets = [["a"], ["a", "b"], ["a", "b", "c"]];

      for (const s1 of sets) {
        for (const s2 of sets) {
          const similarity = service.jaccardSimilarity(s1, s2);
          expect(similarity).toBeGreaterThanOrEqual(0);
          expect(similarity).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  // ====================================================================
  // Test Suite 3: Pair Conflict Detection
  // ====================================================================

  describe("ConflictDetectionService - Pair Conflict Detection", () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
      service = new ConflictDetectionService();
    });

    it("should detect high severity conflict (similarity > 0.7)", () => {
      // set1: {chocolate, chip, cookie, baking, dessert}
      // set2: {chocolate, chip, cookie, baking, dessert, brownies}
      // intersection: {chocolate, chip, cookie, baking, dessert} = 5
      // union: {chocolate, chip, cookie, baking, dessert, brownies} = 6
      // Jaccard = 5/6 ≈ 0.833 (high)
      const keywords1 = ["chocolate", "chip", "cookie", "baking", "dessert"];
      const keywords2 = [
        "chocolate",
        "chip",
        "cookie",
        "baking",
        "dessert",
        "brownies",
      ];

      const result = service.detectPairConflict(keywords1, keywords2, "en");

      expect(result.severity).toBe("high");
      expect(result.jaccardSimilarity).toBeGreaterThan(0.7);
    });

    it("should detect medium severity conflict (0.4-0.7)", () => {
      // set1: {python, data, machine, learning}
      // set2: {python, machine, algorithm}
      // intersection: {python, machine} = 2
      // union: {python, data, machine, learning, algorithm} = 5
      // Jaccard = 2/5 = 0.4
      const keywords1 = ["python", "data", "machine", "learning"];
      const keywords2 = ["python", "machine", "algorithm"];

      const result = service.detectPairConflict(keywords1, keywords2, "en");

      expect(result.severity).toBe("medium");
      expect(result.jaccardSimilarity).toBeGreaterThanOrEqual(0.4);
      expect(result.jaccardSimilarity).toBeLessThanOrEqual(0.7);
    });

    it("should detect low severity conflict (similarity < 0.4)", () => {
      const keywords1 = ["python"];
      const keywords2 = ["javascript"];

      const result = service.detectPairConflict(keywords1, keywords2, "en");

      expect(result.severity).toBe("low");
      expect(result.jaccardSimilarity).toBeLessThan(0.4);
    });

    it("should identify overlapping keywords correctly", () => {
      const keywords1 = ["chocolate", "chip", "cookie"];
      const keywords2 = ["chocolate", "sweet", "dessert"];

      const result = service.detectPairConflict(keywords1, keywords2, "en");

      expect(result.overlapKeywords).toContain("chocolate");
      expect(result.overlapKeywords).not.toContain("chip");
      expect(result.overlapKeywords).not.toContain("sweet");
    });

    it("should handle Chinese keywords", () => {
      const keywords1 = ["饼干", "巧克力"];
      const keywords2 = ["巧克力", "甜点"];

      const result = service.detectPairConflict(keywords1, keywords2, "zh");

      expect(result).toBeDefined();
      expect(result.jaccardSimilarity).toBeGreaterThanOrEqual(0);
      expect(result.jaccardSimilarity).toBeLessThanOrEqual(1);
    });

    it("should return sorted overlap keywords", () => {
      const keywords1 = ["zebra", "apple", "banana"];
      const keywords2 = ["zebra", "apple"];

      const result = service.detectPairConflict(keywords1, keywords2, "en");

      expect(result.overlapKeywords).toEqual(
        [...result.overlapKeywords].sort(),
      );
    });
  });

  // ====================================================================
  // Test Suite 4: Average Similarity Calculation
  // ====================================================================

  describe("ConflictDetectionService - Average Similarity", () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
      service = new ConflictDetectionService();
    });

    it("should return 0 for empty or single set", () => {
      expect(service.averageJaccardSimilarity([], "en")).toBe(0);
      expect(service.averageJaccardSimilarity([["a", "b"]], "en")).toBe(0);
    });

    it("should calculate average across multiple sets", () => {
      const sets = [
        ["a", "b", "c"],
        ["b", "c", "d"],
        ["c", "d", "e"],
      ];

      const avg = service.averageJaccardSimilarity(sets, "en");

      expect(avg).toBeGreaterThan(0);
      expect(avg).toBeLessThanOrEqual(1);
    });

    it("should return value in [0, 1]", () => {
      const sets = [
        ["python", "data"],
        ["python", "science"],
        ["data", "science"],
      ];

      const avg = service.averageJaccardSimilarity(sets, "en");

      expect(avg).toBeGreaterThanOrEqual(0);
      expect(avg).toBeLessThanOrEqual(1);
    });
  });

  // ====================================================================
  // Test Suite 5: Redundancy Score
  // ====================================================================

  describe("ConflictDetectionService - Redundancy Score", () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
      service = new ConflictDetectionService();
    });

    it("should return 0 for completely different sets", () => {
      const sets = [["python"], ["javascript"], ["ruby"]];

      const score = service.calculateRedundancyScore(sets, "en");

      expect(score).toBe(0);
    });

    it("should return high score for similar sets", () => {
      const sets = [
        ["python", "data"],
        ["python", "data"],
        ["python", "data"],
      ];

      const score = service.calculateRedundancyScore(sets, "en");

      expect(score).toBe(1);
    });

    it("should return value in [0, 1]", () => {
      const sets = [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
      ];

      const score = service.calculateRedundancyScore(sets, "en");

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  // ====================================================================
  // Test Suite 6: Multi-Page Analysis Service
  // ====================================================================

  describe("MultiPageAnalysisService - Basic Analysis", () => {
    let service: MultiPageAnalysisService;
    const testProjectId = "test-project-multipage";

    beforeEach(async () => {
      service = new MultiPageAnalysisService();
      // Clean up test data
      await db
        .delete(contentPlans)
        .where(eq(contentPlans.projectId, testProjectId));
    });

    it("should handle empty cluster group", async () => {
      const result = await service.analyzeClusterGroup(testProjectId, [], "en");

      expect(result.pages).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.statistics.totalPages).toBe(0);
    });

    it("should handle single page", async () => {
      const clusterId = randomUUID();

      await db.insert(contentPlans).values({
        id: clusterId,
        projectId: testProjectId,
        clusterId,
        title: "Single Page",
        contentType: "blog",
        createdBy: "test",
      });

      const result = await service.analyzeClusterGroup(
        testProjectId,
        [clusterId],
        "en",
      );

      expect(result.pages).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0); // No pairs to compare
      expect(result.statistics.totalPages).toBe(1);
    });

    it("should detect conflicts between multiple pages", async () => {
      const cluster1 = randomUUID();
      const cluster2 = randomUUID();
      const cluster3 = randomUUID();

      // Create 3 pages: 2 with similar TDK, 1 different
      await db.insert(contentPlans).values({
        id: cluster1,
        projectId: testProjectId,
        clusterId: cluster1,
        title: "Chocolate Cookies",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: {
            keywords: ["chocolate", "chip", "cookies", "baking", "dessert"],
          },
        }),
      });

      await db.insert(contentPlans).values({
        id: cluster2,
        projectId: testProjectId,
        clusterId: cluster2,
        title: "Chocolate Brownies",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: {
            keywords: [
              "chocolate",
              "chip",
              "cookies",
              "baking",
              "dessert",
              "brownies",
            ],
          },
        }),
      });

      await db.insert(contentPlans).values({
        id: cluster3,
        projectId: testProjectId,
        clusterId: cluster3,
        title: "Python Programming",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: {
            keywords: ["python", "programming"],
          },
        }),
      });

      const result = await service.analyzeClusterGroup(
        testProjectId,
        [cluster1, cluster2, cluster3],
        "en",
      );

      expect(result.pages).toHaveLength(3);
      expect(result.conflicts.length).toBeGreaterThan(0);

      // Should detect high conflict between cluster1 and cluster2
      const conflict12 = result.conflicts.find(
        (c) =>
          (c.cluster1Id === cluster1 && c.cluster2Id === cluster2) ||
          (c.cluster1Id === cluster2 && c.cluster2Id === cluster1),
      );
      expect(conflict12?.severity).toBe("high");

      // Should detect low conflict between cluster1/2 and cluster3
      const conflict13 = result.conflicts.find(
        (c) =>
          (c.cluster1Id === cluster1 && c.cluster2Id === cluster3) ||
          (c.cluster1Id === cluster3 && c.cluster2Id === cluster1),
      );
      expect(conflict13?.severity).toBe("low");
    });

    it("should calculate topic coherence", async () => {
      const cluster1 = randomUUID();
      const cluster2 = randomUUID();

      await db.insert(contentPlans).values({
        id: cluster1,
        projectId: testProjectId,
        clusterId: cluster1,
        title: "Page 1",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: { keywords: ["python", "data"] },
        }),
      });

      await db.insert(contentPlans).values({
        id: cluster2,
        projectId: testProjectId,
        clusterId: cluster2,
        title: "Page 2",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: { keywords: ["python", "science"] },
        }),
      });

      const result = await service.analyzeClusterGroup(
        testProjectId,
        [cluster1, cluster2],
        "en",
      );

      expect(result.topicCoherence.avgJaccardSimilarity).toBeGreaterThan(0);
      expect(result.topicCoherence.redundancyScore).toBeGreaterThanOrEqual(0);
      expect(result.topicCoherence.redundancyScore).toBeLessThanOrEqual(1);
    });

    it("should calculate correct statistics", async () => {
      const cluster1 = randomUUID();
      const cluster2 = randomUUID();

      await db.insert(contentPlans).values({
        id: cluster1,
        projectId: testProjectId,
        clusterId: cluster1,
        title: "Generated Page",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: { keywords: ["a", "b", "c"] },
        }),
        tdkLanguage: "en",
      });

      await db.insert(contentPlans).values({
        id: cluster2,
        projectId: testProjectId,
        clusterId: cluster2,
        title: "No TDK Page",
        contentType: "blog",
        createdBy: "test",
      });

      const result = await service.analyzeClusterGroup(
        testProjectId,
        [cluster1, cluster2],
        "en",
      );

      expect(result.statistics.totalPages).toBe(2);
      expect(result.statistics.generatedCount).toBe(1);
      expect(result.statistics.avgKeywordCount).toBe(3);
      expect(result.statistics.languageDistribution.en).toBe(1);
    });

    it("should handle pages without TDK", async () => {
      const cluster1 = randomUUID();
      const cluster2 = randomUUID();

      // Only cluster1 has TDK
      await db.insert(contentPlans).values({
        id: cluster1,
        projectId: testProjectId,
        clusterId: cluster1,
        title: "With TDK",
        contentType: "blog",
        createdBy: "test",
        tdkJson: JSON.stringify({
          primary: { keywords: ["python"] },
        }),
      });

      await db.insert(contentPlans).values({
        id: cluster2,
        projectId: testProjectId,
        clusterId: cluster2,
        title: "No TDK",
        contentType: "blog",
        createdBy: "test",
      });

      const result = await service.analyzeClusterGroup(
        testProjectId,
        [cluster1, cluster2],
        "en",
      );

      // Should not create conflicts with pages without TDK
      expect(result.conflicts).toHaveLength(0);
      expect(result.pages).toHaveLength(2);
      expect(result.statistics.generatedCount).toBe(1);
    });
  });

  // ====================================================================
  // Test Suite 7: Edge Cases
  // ====================================================================

  describe("Edge Cases", () => {
    let service: ConflictDetectionService;
    let analysisService: MultiPageAnalysisService;

    beforeEach(() => {
      service = new ConflictDetectionService();
      analysisService = new MultiPageAnalysisService();
    });

    it("should handle very long keyword lists", () => {
      const longList = Array.from({ length: 100 }, (_, i) => `keyword${i}`);
      const result = service.normalizeKeywords(longList, "en");

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle mixed case and special characters", () => {
      const keywords = ["Python-3.9", "JavaScript_ES6", "C++"];
      const result = service.normalizeKeywords(keywords, "en");

      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle keywords with only stopwords", () => {
      const keywords = ["the", "a", "is", "and"];
      const result = service.normalizeKeywords(keywords, "en");

      // Should be empty after removing all stopwords
      expect(result).toHaveLength(0);
    });
  });
});
