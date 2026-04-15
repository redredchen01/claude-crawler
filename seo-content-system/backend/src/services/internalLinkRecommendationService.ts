/**
 * Internal Link Recommendation Service
 * Generates semantic link recommendations between content clusters
 * Phase 2.6: Enables content interconnection for SEO topical authority
 */

import { Cluster } from "./clusteringService.js";

export interface InternalLinkRecommendation {
  sourceClusterId: string;
  sourceKeyword: string;
  targetClusterId: string;
  targetKeyword: string;
  targetPageType: string;
  linkAnchorText: string;
  relevanceScore: number; // 0-100
  linkContext: string; // Where in content this link makes sense
  linkType: "topical" | "related" | "prerequisite" | "expansion";
}

export interface InternalLinkSuggestions {
  clusterId: string;
  pillarKeyword: string;
  incomingLinks: InternalLinkRecommendation[]; // Links TO this cluster
  outgoingLinks: InternalLinkRecommendation[]; // Links FROM this cluster
  linkingStrategies: string[]; // SEO strategies applied
  generatedAt: number;
}

export class InternalLinkRecommendationService {
  /**
   * Generate internal link recommendations for a single cluster
   */
  generateLinksForCluster(
    sourceCluster: Cluster,
    allClusters: Cluster[],
  ): InternalLinkSuggestions {
    // Filter out self-references
    const otherClusters = allClusters.filter((c) => c.id !== sourceCluster.id);

    // Generate outgoing links (from source cluster to others)
    const outgoingLinks = this.findOutgoingLinks(sourceCluster, otherClusters);

    // Generate incoming links (from others to source cluster)
    const incomingLinks = this.findIncomingLinks(sourceCluster, otherClusters);

    // Determine applied strategies
    const linkingStrategies = this.determineLinkingStrategies(
      sourceCluster,
      outgoingLinks,
      incomingLinks,
    );

    return {
      clusterId: sourceCluster.id,
      pillarKeyword: sourceCluster.pillarKeyword,
      incomingLinks,
      outgoingLinks,
      linkingStrategies,
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate internal link recommendations for multiple clusters
   */
  generateLinksBatch(clusters: Cluster[]): InternalLinkSuggestions[] {
    return clusters.map((cluster) =>
      this.generateLinksForCluster(cluster, clusters),
    );
  }

  /**
   * Find outgoing links from source cluster to other clusters
   */
  private findOutgoingLinks(
    sourceCluster: Cluster,
    otherClusters: Cluster[],
  ): InternalLinkRecommendation[] {
    const links: InternalLinkRecommendation[] = [];

    for (const targetCluster of otherClusters) {
      const relevanceScore = this.calculateSemanticRelevance(
        sourceCluster,
        targetCluster,
      );

      // Only recommend links with meaningful relevance (> 30)
      if (relevanceScore > 30) {
        const linkType = this.determineLinkType(
          sourceCluster,
          targetCluster,
          relevanceScore,
        );
        const linkContext = this.generateLinkContext(
          sourceCluster,
          targetCluster,
          linkType,
        );
        const anchorText = this.generateAnchorText(targetCluster, linkType);

        links.push({
          sourceClusterId: sourceCluster.id,
          sourceKeyword: sourceCluster.pillarKeyword,
          targetClusterId: targetCluster.id,
          targetKeyword: targetCluster.pillarKeyword,
          targetPageType: targetCluster.pageType,
          linkAnchorText: anchorText,
          relevanceScore,
          linkContext,
          linkType,
        });
      }
    }

    // Sort by relevance score descending, limit to top 5
    return links
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  /**
   * Find incoming links to source cluster from other clusters
   */
  private findIncomingLinks(
    sourceCluster: Cluster,
    otherClusters: Cluster[],
  ): InternalLinkRecommendation[] {
    const links: InternalLinkRecommendation[] = [];

    for (const potentialSource of otherClusters) {
      const relevanceScore = this.calculateSemanticRelevance(
        potentialSource,
        sourceCluster,
      );

      // Only recommend links with meaningful relevance (> 30)
      if (relevanceScore > 30) {
        const linkType = this.determineLinkType(
          potentialSource,
          sourceCluster,
          relevanceScore,
        );
        const linkContext = this.generateLinkContext(
          potentialSource,
          sourceCluster,
          linkType,
        );
        const anchorText = this.generateAnchorText(sourceCluster, linkType);

        links.push({
          sourceClusterId: potentialSource.id,
          sourceKeyword: potentialSource.pillarKeyword,
          targetClusterId: sourceCluster.id,
          targetKeyword: sourceCluster.pillarKeyword,
          targetPageType: sourceCluster.pageType,
          linkAnchorText: anchorText,
          relevanceScore,
          linkContext,
          linkType,
        });
      }
    }

    // Sort by relevance score descending, limit to top 5
    return links
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  /**
   * Calculate semantic relevance between two clusters (0-100)
   */
  private calculateSemanticRelevance(source: Cluster, target: Cluster): number {
    let score = 0;

    // Keyword overlap scoring
    const sourceWords = new Set(
      source.pillarKeyword.toLowerCase().split(/\s+/),
    );
    const targetWords = new Set(
      target.pillarKeyword.toLowerCase().split(/\s+/),
    );
    const intersection = [...sourceWords].filter((w) =>
      targetWords.has(w),
    ).length;
    const union = sourceWords.size + targetWords.size - intersection;
    const keywordOverlapScore = union > 0 ? (intersection / union) * 100 : 0;

    // Related keyword overlap
    const sourceRelated = new Set(source.keywords.map((k) => k.toLowerCase()));
    const targetRelated = new Set(target.keywords.map((k) => k.toLowerCase()));
    let relatedOverlap = 0;
    for (const keyword of sourceRelated) {
      if (
        targetRelated.has(keyword) ||
        [...targetRelated].some((tk) => tk.includes(keyword))
      ) {
        relatedOverlap++;
      }
    }
    const relatedOverlapScore =
      sourceRelated.size > 0 ? (relatedOverlap / sourceRelated.size) * 50 : 0;

    // Intent compatibility
    const intentScore = source.pageType === target.pageType ? 15 : 0;

    // Priority boost for high-priority targets
    const priorityScore = target.priority >= 70 ? 10 : 0;

    score =
      keywordOverlapScore * 0.4 +
      relatedOverlapScore * 0.3 +
      intentScore +
      priorityScore;

    return Math.min(score, 100);
  }

  /**
   * Determine link type based on cluster relationship
   */
  private determineLinkType(
    source: Cluster,
    target: Cluster,
    relevanceScore: number,
  ): "topical" | "related" | "prerequisite" | "expansion" {
    // Topical: same or very similar intent
    if (source.pageType === target.pageType && relevanceScore >= 60) {
      return "topical";
    }

    // Prerequisite: broader topic linking to narrower
    if (
      source.pillarKeyword.length > target.pillarKeyword.length &&
      relevanceScore >= 40
    ) {
      return "prerequisite";
    }

    // Expansion: narrower topic linking to broader
    if (
      source.pillarKeyword.length < target.pillarKeyword.length &&
      relevanceScore >= 40
    ) {
      return "expansion";
    }

    // Related: moderate relevance
    return "related";
  }

  /**
   * Generate link context description
   */
  private generateLinkContext(
    source: Cluster,
    target: Cluster,
    linkType: string,
  ): string {
    const contexts: Record<string, string[]> = {
      topical: [
        `In the "${source.pillarKeyword}" section, discuss related topic: ${target.pillarKeyword}`,
        `When explaining "${source.pillarKeyword}", reference "${target.pillarKeyword}" for deeper context`,
        `Readers interested in "${source.pillarKeyword}" would benefit from learning "${target.pillarKeyword}"`,
      ],
      related: [
        `As a complementary topic to "${source.pillarKeyword}"`,
        `For readers wanting to expand their knowledge of "${source.pillarKeyword}"`,
        `Related resource: "${target.pillarKeyword}"`,
      ],
      prerequisite: [
        `Provide foundation knowledge before discussing "${target.pillarKeyword}"`,
        `Link to "${source.pillarKeyword}" when readers encounter "${target.pillarKeyword}"`,
        `"${source.pillarKeyword}" is essential background for "${target.pillarKeyword}"`,
      ],
      expansion: [
        `Explore "${target.pillarKeyword}" as an extension of "${source.pillarKeyword}"`,
        `For more advanced uses of "${source.pillarKeyword}", see "${target.pillarKeyword}"`,
        `Take your "${source.pillarKeyword}" knowledge further with "${target.pillarKeyword}"`,
      ],
    };

    const contextList = contexts[linkType] || contexts.related;
    return contextList[Math.floor(Math.random() * contextList.length)];
  }

  /**
   * Generate anchor text for the link
   */
  private generateAnchorText(targetCluster: Cluster, linkType: string): string {
    const basePillars = targetCluster.pillarKeyword;

    // Generate varied anchor text based on link type
    const anchors: Record<string, string[]> = {
      topical: [
        basePillars,
        `our guide to ${basePillars}`,
        `learn more about ${basePillars}`,
      ],
      related: [
        `${basePillars}`,
        `related topic: ${basePillars}`,
        `explore ${basePillars}`,
      ],
      prerequisite: [
        `${basePillars}`,
        `foundational knowledge about ${basePillars}`,
        `understand ${basePillars} first`,
      ],
      expansion: [
        `advanced ${basePillars}`,
        `${basePillars} techniques`,
        `explore ${basePillars} further`,
      ],
    };

    const anchorList = anchors[linkType] || anchors.related;
    return anchorList[Math.floor(Math.random() * anchorList.length)];
  }

  /**
   * Determine which linking strategies were applied
   */
  private determineLinkingStrategies(
    _sourceCluster: Cluster,
    outgoingLinks: InternalLinkRecommendation[],
    incomingLinks: InternalLinkRecommendation[],
  ): string[] {
    const strategies: string[] = [];

    if (outgoingLinks.length > 0) {
      strategies.push("outbound_topical_links");
    }

    if (incomingLinks.length > 0) {
      strategies.push("inbound_topical_links");
    }

    // Check for topical authority (many topical links)
    const topicalOutgoing = outgoingLinks.filter(
      (l) => l.linkType === "topical",
    );
    if (topicalOutgoing.length >= 3) {
      strategies.push("topical_authority_hub");
    }

    // Check for prerequisite chains
    const prerequisiteLinks = outgoingLinks.filter(
      (l) => l.linkType === "prerequisite",
    );
    if (prerequisiteLinks.length >= 2) {
      strategies.push("prerequisite_chain");
    }

    // Check for comprehensive coverage
    if (outgoingLinks.length >= 5) {
      strategies.push("comprehensive_internal_linking");
    }

    if (strategies.length === 0) {
      strategies.push("basic_related_links");
    }

    return strategies;
  }
}
