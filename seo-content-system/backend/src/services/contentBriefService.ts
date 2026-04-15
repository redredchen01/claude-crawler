/**
 * Content Brief Generation Service
 * Generates SEO-optimized content briefs using Claude AI
 * Phase 2.4: Creates actionable content outlines from keyword clusters
 */

import Anthropic from "@anthropic-ai/sdk";
import { Cluster } from "./clusteringService.js";
import { IntentPrimary, ContentFormat } from "../types/classification.js";

export interface ContentBrief {
  clusterId: string;
  pillarKeyword: string;
  pageType: ContentFormat;
  title: string;
  metaDescription: string;
  targetIntents: IntentPrimary[];
  outline: ContentSection[];
  targetKeywords: {
    primary: string[];
    secondary: string[];
    longtail: string[];
  };
  faqSuggestions: string[];
  internalLinkTargets: string[];
  contentLength: {
    target: number;
    reasoning: string;
  };
  seoNotes: string[];
  generatedAt: number;
}

export interface ContentSection {
  heading: string;
  level: number; // h1, h2, h3, etc.
  keyPoints: string[];
  estimatedLength: number; // words
}

export class ContentBriefService {
  private client: Anthropic;
  private model = "claude-3-5-sonnet-20241022";

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate content brief for a single keyword cluster
   */
  async generateBrief(
    cluster: Cluster,
    relatedKeywords: string[],
  ): Promise<ContentBrief> {
    const prompt = this.buildBriefPrompt(cluster, relatedKeywords);

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      return this.parseBriefResponse(responseText, cluster);
    } catch (error) {
      console.error(
        `Error generating brief for cluster "${cluster.pillarKeyword}":`,
        error,
      );
      return this.createDefaultBrief(cluster);
    }
  }

  /**
   * Generate briefs for multiple clusters
   */
  async generateBriefBatch(
    clusters: Cluster[],
    allKeywords: Map<string, string[]>,
  ): Promise<ContentBrief[]> {
    const briefs: ContentBrief[] = [];

    // Process clusters sequentially to avoid rate limiting
    for (const cluster of clusters) {
      const relatedKeywords = allKeywords.get(cluster.pillarKeyword) || [];
      const brief = await this.generateBrief(cluster, relatedKeywords);
      briefs.push(brief);

      // Add small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return briefs;
  }

  /**
   * Build prompt for Claude to generate brief
   */
  private buildBriefPrompt(
    cluster: Cluster,
    relatedKeywords: string[],
  ): string {
    return `You are an expert SEO content strategist. Generate a content brief for a ${cluster.pageType} page targeting the following keyword cluster.

Cluster Information:
- Pillar Keyword: "${cluster.pillarKeyword}"
- Related Keywords: ${relatedKeywords.slice(0, 10).join(", ")}
- Content Type: ${cluster.pageType}
- Page Priority: ${cluster.priority}/100

Generate a comprehensive content brief in JSON format with the following structure:
{
  "title": "SEO-optimized page title (50-60 characters)",
  "metaDescription": "Compelling meta description (150-160 characters)",
  "outline": [
    {
      "heading": "Section heading",
      "level": 2,
      "keyPoints": ["Key point 1", "Key point 2"],
      "estimatedLength": 300
    }
  ],
  "targetKeywords": {
    "primary": ["primary keywords to target"],
    "secondary": ["secondary keywords"],
    "longtail": ["long-tail variations"]
  },
  "faqSuggestions": ["FAQ question 1", "FAQ question 2"],
  "internalLinkTargets": ["Related topic 1", "Related topic 2"],
  "contentLength": {
    "target": 1500,
    "reasoning": "Why this length is optimal"
  },
  "seoNotes": ["Note 1", "Note 2"]
}

Focus on:
1. Creating a logical, scannable outline with h2 and h3 headers
2. Including all related keywords naturally throughout
3. Providing actionable FAQ topics
4. Suggesting internal linking opportunities
5. Optimal content length for the keyword intent

Return ONLY valid JSON, no markdown formatting or explanations.`;
  }

  /**
   * Parse Claude's response into a ContentBrief
   */
  private parseBriefResponse(response: string, cluster: Cluster): ContentBrief {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response;
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      const briefData = {
        clusterId: cluster.id,
        pillarKeyword: cluster.pillarKeyword,
        pageType: cluster.pageType as ContentFormat,
        title: parsed.title || this.generateDefaultTitle(cluster),
        metaDescription:
          parsed.metaDescription ||
          this.generateDefaultMetaDescription(cluster),
        targetIntents: this.extractTargetIntents(
          cluster.pageType as ContentFormat,
        ),
        outline: this.parseOutline(parsed.outline || []),
        targetKeywords: parsed.targetKeywords || {
          primary: [cluster.pillarKeyword],
          secondary: cluster.keywords.slice(0, 5),
          longtail: cluster.keywords.slice(5),
        },
        faqSuggestions: parsed.faqSuggestions || [],
        internalLinkTargets: parsed.internalLinkTargets || [],
        contentLength: parsed.contentLength || {
          target: 1500,
          reasoning: "Optimal length for comprehensive coverage",
        },
        seoNotes: parsed.seoNotes || [],
        generatedAt: Date.now(),
      };

      return briefData as ContentBrief;
    } catch (error) {
      console.error("Error parsing brief response:", error);
      return this.createDefaultBrief(cluster);
    }
  }

  /**
   * Parse outline structure from response
   */
  private parseOutline(outlineData: any[]): ContentSection[] {
    return outlineData.map((item) => ({
      heading: item.heading || "",
      level: item.level || 2,
      keyPoints: item.keyPoints || [],
      estimatedLength: item.estimatedLength || 300,
    }));
  }

  /**
   * Extract target intents based on page type
   */
  private extractTargetIntents(pageType: ContentFormat): IntentPrimary[] {
    const intentMap: Record<string, IntentPrimary[]> = {
      article: ["informational"],
      faq: ["informational"],
      category: ["informational", "navigational"],
      landing: ["transactional", "commercial"],
      comparison: ["commercial"],
      glossary: ["informational"],
      topic_page: ["informational"],
    };

    return intentMap[pageType] || ["informational"];
  }

  /**
   * Create default brief when AI generation fails
   */
  private createDefaultBrief(cluster: Cluster): ContentBrief {
    const pageType = cluster.pageType as ContentFormat;
    return {
      clusterId: cluster.id,
      pillarKeyword: cluster.pillarKeyword,
      pageType,
      title: this.generateDefaultTitle(cluster),
      metaDescription: this.generateDefaultMetaDescription(cluster),
      targetIntents: this.extractTargetIntents(pageType),
      outline: this.generateDefaultOutline(cluster),
      targetKeywords: {
        primary: [cluster.pillarKeyword],
        secondary: cluster.keywords.slice(0, 5),
        longtail: cluster.keywords.slice(5, 15),
      },
      faqSuggestions: this.generateDefaultFAQs(cluster),
      internalLinkTargets: [],
      contentLength: {
        target: this.calculateTargetLength(pageType),
        reasoning: "Optimal length based on content type",
      },
      seoNotes: [
        "Include pillar keyword in H1",
        "Use related keywords in H2 subheadings",
        "Add internal links to supporting content",
      ],
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate default title
   */
  private generateDefaultTitle(cluster: Cluster): string {
    const maxLength = 60;
    const words = cluster.pillarKeyword.split(" ");
    let title = `${words[0]}: Complete Guide to ${cluster.pillarKeyword}`;

    if (title.length > maxLength) {
      title = `${cluster.pillarKeyword}: A Beginner's Guide`;
    }

    return title.substring(0, maxLength);
  }

  /**
   * Generate default meta description
   */
  private generateDefaultMetaDescription(cluster: Cluster): string {
    const descriptions: Record<string, string> = {
      article: `Learn everything about ${cluster.pillarKeyword}. Expert guide with tips, best practices, and comprehensive coverage.`,
      faq: `Frequently asked questions about ${cluster.pillarKeyword}. Get answers to common questions.`,
      category: `Explore ${cluster.pillarKeyword} content. Browse articles and resources.`,
      landing: `Discover ${cluster.pillarKeyword} solutions. Find what you need today.`,
      comparison: `Compare ${cluster.pillarKeyword} options. Find the best choice for you.`,
      glossary: `${cluster.pillarKeyword} definition and related terms. Clear explanations.`,
      topic_page: `Everything about ${cluster.pillarKeyword}. In-depth overview and insights.`,
    };

    return (descriptions[cluster.pageType] || descriptions.article).substring(
      0,
      160,
    );
  }

  /**
   * Generate default outline
   */
  private generateDefaultOutline(cluster: Cluster): ContentSection[] {
    return [
      {
        heading: `What is ${cluster.pillarKeyword}?`,
        level: 2,
        keyPoints: ["Definition", "Key concepts", "Importance"],
        estimatedLength: 300,
      },
      {
        heading: `Benefits of ${cluster.pillarKeyword}`,
        level: 2,
        keyPoints: ["Benefit 1", "Benefit 2", "Benefit 3"],
        estimatedLength: 400,
      },
      {
        heading: `How to Get Started`,
        level: 2,
        keyPoints: ["Step 1", "Step 2", "Step 3"],
        estimatedLength: 350,
      },
      {
        heading: `Best Practices`,
        level: 2,
        keyPoints: ["Practice 1", "Practice 2"],
        estimatedLength: 300,
      },
      {
        heading: `Conclusion`,
        level: 2,
        keyPoints: ["Summary", "Key takeaway"],
        estimatedLength: 150,
      },
    ];
  }

  /**
   * Generate default FAQs
   */
  private generateDefaultFAQs(cluster: Cluster): string[] {
    return [
      `What is ${cluster.pillarKeyword}?`,
      `How do I ${cluster.pillarKeyword}?`,
      `What are the benefits of ${cluster.pillarKeyword}?`,
      `How much does ${cluster.pillarKeyword} cost?`,
      `Is ${cluster.pillarKeyword} right for me?`,
    ];
  }

  /**
   * Calculate target content length based on page type
   */
  private calculateTargetLength(pageType: ContentFormat): number {
    const lengths: Record<string, number> = {
      article: 2000,
      faq: 1500,
      category: 1200,
      landing: 1500,
      comparison: 2500,
      glossary: 800,
      topic_page: 3000,
    };

    return lengths[pageType] || 1500;
  }
}
