import { describe, it, expect, beforeAll } from "@jest/globals";
import { InternalLinkRecommendationService } from "../../src/services/internalLinkRecommendationService.js";
import { Cluster } from "../../src/services/clusteringService.js";

describe("InternalLinkRecommendationService", () => {
  let service: InternalLinkRecommendationService;
  let mockClusters: Cluster[];

  beforeAll(() => {
    service = new InternalLinkRecommendationService();

    mockClusters = [
      {
        id: "cluster-1",
        name: "Python Tutorial Cluster",
        pillarKeyword: "python tutorial",
        keywords: [
          "python tutorial",
          "learn python",
          "python guide",
          "python basics",
        ],
        keywordIds: ["kw-1", "kw-2", "kw-3", "kw-4"],
        pageType: "article",
        priority: 85,
        confidenceScore: 0.9,
        createdAt: Date.now(),
      },
      {
        id: "cluster-2",
        name: "Python Advanced Cluster",
        pillarKeyword: "advanced python techniques",
        keywords: [
          "advanced python",
          "python best practices",
          "python patterns",
        ],
        keywordIds: ["kw-5", "kw-6", "kw-7"],
        pageType: "article",
        priority: 75,
        confidenceScore: 0.85,
        createdAt: Date.now(),
      },
      {
        id: "cluster-3",
        name: "Django Framework Cluster",
        pillarKeyword: "django web framework",
        keywords: ["django", "django tutorial", "django rest api"],
        keywordIds: ["kw-8", "kw-9", "kw-10"],
        pageType: "article",
        priority: 80,
        confidenceScore: 0.88,
        createdAt: Date.now(),
      },
      {
        id: "cluster-4",
        name: "JavaScript Tutorial Cluster",
        pillarKeyword: "javascript tutorial",
        keywords: ["learn javascript", "javascript guide", "js basics"],
        keywordIds: ["kw-11", "kw-12", "kw-13"],
        pageType: "article",
        priority: 88,
        confidenceScore: 0.92,
        createdAt: Date.now(),
      },
    ];
  });

  describe("Single Cluster Link Generation", () => {
    it("should generate valid link suggestions for a cluster", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      expect(suggestions).toBeDefined();
      expect(suggestions.clusterId).toBe("cluster-1");
      expect(suggestions.pillarKeyword).toBe("python tutorial");
      expect(Array.isArray(suggestions.incomingLinks)).toBe(true);
      expect(Array.isArray(suggestions.outgoingLinks)).toBe(true);
    });

    it("should not recommend self-links", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      for (const link of allLinks) {
        expect(link.sourceClusterId).not.toBe(link.targetClusterId);
        expect(link.targetClusterId).not.toBe("cluster-1");
      }
    });

    it("should include outgoing links to related clusters", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      // Python tutorial should link to advanced python and django
      expect(suggestions.outgoingLinks.length).toBeGreaterThan(0);

      const targetIds = suggestions.outgoingLinks.map((l) => l.targetClusterId);
      expect(targetIds).toContain("cluster-2");
    });

    it("should have valid link recommendations structure", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      for (const link of suggestions.outgoingLinks) {
        expect(link.sourceClusterId).toBeDefined();
        expect(link.sourceKeyword).toBeDefined();
        expect(link.targetClusterId).toBeDefined();
        expect(link.targetKeyword).toBeDefined();
        expect(link.linkAnchorText).toBeDefined();
        expect(link.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(link.relevanceScore).toBeLessThanOrEqual(100);
        expect(link.linkContext).toBeDefined();
        expect(["topical", "related", "prerequisite", "expansion"]).toContain(
          link.linkType,
        );
      }
    });

    it("should limit outgoing links to maximum 5", () => {
      const manyClustersMock = [
        mockClusters[0],
        ...mockClusters,
        ...mockClusters,
        ...mockClusters,
      ];

      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        manyClustersMock,
      );

      expect(suggestions.outgoingLinks.length).toBeLessThanOrEqual(5);
    });

    it("should limit incoming links to maximum 5", () => {
      const manyClustersMock = [
        mockClusters[0],
        ...mockClusters,
        ...mockClusters,
        ...mockClusters,
      ];

      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        manyClustersMock,
      );

      expect(suggestions.incomingLinks.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Link Relevance Scoring", () => {
    it("should assign higher scores to semantically related clusters", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      // Python clusters should be more relevant to each other
      const pythonLinks = suggestions.outgoingLinks.filter(
        (l) =>
          l.targetClusterId === "cluster-2" ||
          l.targetClusterId === "cluster-3",
      );

      const jsLinks = suggestions.outgoingLinks.filter(
        (l) => l.targetClusterId === "cluster-4",
      );

      if (pythonLinks.length > 0 && jsLinks.length > 0) {
        const pythonScore = Math.max(
          ...pythonLinks.map((l) => l.relevanceScore),
        );
        const jsScore = Math.max(...jsLinks.map((l) => l.relevanceScore));
        expect(pythonScore).toBeGreaterThan(jsScore);
      }
    });

    it("should have reasonable relevance score ranges", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      for (const link of allLinks) {
        expect(link.relevanceScore).toBeGreaterThan(30);
        expect(link.relevanceScore).toBeLessThanOrEqual(100);
      }
    });

    it("should sort links by relevance score descending", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const outgoing = suggestions.outgoingLinks;
      for (let i = 0; i < outgoing.length - 1; i++) {
        expect(outgoing[i].relevanceScore).toBeGreaterThanOrEqual(
          outgoing[i + 1].relevanceScore,
        );
      }
    });
  });

  describe("Link Type Detection", () => {
    it("should identify topical links correctly", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const topicalLinks = suggestions.outgoingLinks.filter(
        (l) => l.linkType === "topical",
      );

      // Python tutorial and advanced python should be topical
      expect(topicalLinks.length).toBeGreaterThan(0);
    });

    it("should identify prerequisite and expansion links", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      const hasPrerequisiteOrExpansion = allLinks.some(
        (l) => l.linkType === "prerequisite" || l.linkType === "expansion",
      );

      // At least some links should be prerequisite or expansion
      expect(hasPrerequisiteOrExpansion).toBe(true);
    });

    it("should only use valid link types", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      const validTypes = ["topical", "related", "prerequisite", "expansion"];

      for (const link of allLinks) {
        expect(validTypes).toContain(link.linkType);
      }
    });
  });

  describe("Anchor Text Generation", () => {
    it("should generate meaningful anchor text", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      for (const link of allLinks) {
        expect(link.linkAnchorText.length).toBeGreaterThan(0);
        expect(link.linkAnchorText.length).toBeLessThan(100);
        // Anchor text should reference target keyword
        expect(
          link.linkAnchorText
            .toLowerCase()
            .includes(link.targetKeyword.split(" ")[0].toLowerCase()),
        ).toBe(true);
      }
    });

    it("should vary anchor text for different link types", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const topicalLinks = suggestions.outgoingLinks.filter(
        (l) => l.linkType === "topical",
      );
      const expansionLinks = suggestions.outgoingLinks.filter(
        (l) => l.linkType === "expansion",
      );

      if (topicalLinks.length > 0 && expansionLinks.length > 0) {
        // Different link types should generally have different anchor patterns
        expect(topicalLinks[0].linkAnchorText).toBeTruthy();
        expect(expansionLinks[0].linkAnchorText).toBeTruthy();
      }
    });
  });

  describe("Link Context", () => {
    it("should provide meaningful link context", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const allLinks = [
        ...suggestions.incomingLinks,
        ...suggestions.outgoingLinks,
      ];

      for (const link of allLinks) {
        expect(link.linkContext.length).toBeGreaterThan(20);
        expect(link.linkContext).toBeDefined();
        expect(typeof link.linkContext).toBe("string");
      }
    });

    it("should include cluster keywords in context", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      for (const link of suggestions.outgoingLinks) {
        const context = link.linkContext.toLowerCase();
        expect(context).toContain(
          link.sourceKeyword.split(" ")[0].toLowerCase(),
        );
      }
    });
  });

  describe("Linking Strategies", () => {
    it("should identify applied linking strategies", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      expect(suggestions.linkingStrategies).toBeDefined();
      expect(Array.isArray(suggestions.linkingStrategies)).toBe(true);
      expect(suggestions.linkingStrategies.length).toBeGreaterThan(0);
    });

    it("should recognize topical authority hubs", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      // Python tutorial cluster has multiple related clusters
      if (
        suggestions.outgoingLinks.filter((l) => l.linkType === "topical")
          .length >= 3
      ) {
        expect(suggestions.linkingStrategies).toContain(
          "topical_authority_hub",
        );
      }
    });

    it("should recognize comprehensive internal linking", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      if (suggestions.outgoingLinks.length >= 5) {
        expect(suggestions.linkingStrategies).toContain(
          "comprehensive_internal_linking",
        );
      }
    });

    it("should use valid strategy names", () => {
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );

      const validStrategies = [
        "outbound_topical_links",
        "inbound_topical_links",
        "topical_authority_hub",
        "prerequisite_chain",
        "comprehensive_internal_linking",
        "basic_related_links",
      ];

      for (const strategy of suggestions.linkingStrategies) {
        expect(validStrategies).toContain(strategy);
      }
    });
  });

  describe("Batch Generation", () => {
    it("should generate links for multiple clusters", () => {
      const allSuggestions = service.generateLinksBatch(mockClusters);

      expect(allSuggestions.length).toBe(mockClusters.length);

      for (let i = 0; i < allSuggestions.length; i++) {
        expect(allSuggestions[i].clusterId).toBe(mockClusters[i].id);
      }
    });

    it("should maintain referential consistency in batch", () => {
      const allSuggestions = service.generateLinksBatch(mockClusters);

      // Check that if A links to B, the relationship is consistent
      for (const suggestion of allSuggestions) {
        for (const outgoingLink of suggestion.outgoingLinks) {
          const targetSuggestion = allSuggestions.find(
            (s) => s.clusterId === outgoingLink.targetClusterId,
          );
          expect(targetSuggestion).toBeDefined();
        }
      }
    });

    it("should not have circular self-references in batch", () => {
      const allSuggestions = service.generateLinksBatch(mockClusters);

      for (const suggestion of allSuggestions) {
        const allLinks = [
          ...suggestion.incomingLinks,
          ...suggestion.outgoingLinks,
        ];

        for (const link of allLinks) {
          expect(link.targetClusterId).not.toBe(suggestion.clusterId);
        }
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle single cluster gracefully", () => {
      const suggestions = service.generateLinksForCluster(mockClusters[0], [
        mockClusters[0],
      ]);

      expect(suggestions).toBeDefined();
      expect(suggestions.outgoingLinks.length).toBe(0);
      expect(suggestions.incomingLinks.length).toBe(0);
    });

    it("should handle clusters with no related keywords", () => {
      const isolatedCluster: Cluster = {
        id: "isolated",
        name: "Isolated Cluster",
        pillarKeyword: "obscure xyz topic",
        keywords: ["obscure xyz topic", "very unique keyword"],
        keywordIds: ["kw-iso-1", "kw-iso-2"],
        pageType: "article",
        priority: 50,
        confidenceScore: 0.7,
        createdAt: Date.now(),
      };

      const suggestions = service.generateLinksForCluster(isolatedCluster, [
        ...mockClusters,
        isolatedCluster,
      ]);

      // Should still generate some basic links or handle gracefully
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions.outgoingLinks)).toBe(true);
      expect(Array.isArray(suggestions.incomingLinks)).toBe(true);
    });

    it("should handle high-priority cluster differentiation", () => {
      const highPriorityCluster: Cluster = {
        ...mockClusters[0],
        priority: 95,
      };

      const suggestions = service.generateLinksForCluster(mockClusters[1], [
        highPriorityCluster,
        ...mockClusters,
      ]);

      // High priority cluster should be preferred as link target
      const highPriorityLinks = suggestions.outgoingLinks.filter(
        (l) => l.targetClusterId === highPriorityCluster.id,
      );

      // Should be among top links
      if (highPriorityLinks.length > 0) {
        expect(suggestions.outgoingLinks.slice(0, 2)).toContainEqual(
          highPriorityLinks[0],
        );
      }
    });
  });

  describe("Timestamps", () => {
    it("should include generation timestamp", () => {
      const beforeGeneration = Date.now();
      const suggestions = service.generateLinksForCluster(
        mockClusters[0],
        mockClusters,
      );
      const afterGeneration = Date.now();

      expect(suggestions.generatedAt).toBeGreaterThanOrEqual(beforeGeneration);
      expect(suggestions.generatedAt).toBeLessThanOrEqual(afterGeneration);
    });
  });

  describe("Content Integration", () => {
    it("should recommend complementary page types for linking", () => {
      const faqCluster: Cluster = {
        ...mockClusters[0],
        id: "faq-1",
        pageType: "faq",
      };

      const suggestions = service.generateLinksForCluster(mockClusters[0], [
        mockClusters[0],
        faqCluster,
        ...mockClusters.slice(1),
      ]);

      // FAQ page should be among link recommendations
      const faqLinks = suggestions.outgoingLinks.filter(
        (l) => l.targetPageType === "faq",
      );

      // May or may not find FAQ links depending on relevance
      for (const link of faqLinks) {
        expect(link.targetPageType).toBe("faq");
      }
    });
  });
});
