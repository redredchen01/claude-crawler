/**
 * FAQ Auto-Generation Service
 * Generates FAQ pages from keyword clusters using Claude AI
 * Phase 2.5: Creates question-answer pairs for FAQ content
 */

import Anthropic from "@anthropic-ai/sdk";
import { Cluster } from "./clusteringService.js";

export interface FAQPair {
  question: string;
  answer: string;
  relatedKeywords: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface FAQPage {
  clusterId: string;
  pillarKeyword: string;
  faqs: FAQPair[];
  pageTitle: string;
  introduction: string;
  conclusion: string;
  relatedTopics: string[];
  generatedAt: number;
}

export class FAQGenerationService {
  private client: Anthropic;
  private model = "claude-3-5-sonnet-20241022";

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate FAQ page for a keyword cluster
   */
  async generateFAQPage(
    cluster: Cluster,
    contentBriefTitle?: string,
  ): Promise<FAQPage> {
    const prompt = this.buildFAQPrompt(cluster, contentBriefTitle);

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      return this.parseFAQResponse(responseText, cluster);
    } catch (error) {
      console.error(
        `Error generating FAQs for cluster "${cluster.pillarKeyword}":`,
        error,
      );
      return this.createDefaultFAQPage(cluster);
    }
  }

  /**
   * Generate FAQs for multiple clusters
   */
  async generateFAQBatch(
    clusters: Cluster[],
    contentBriefs?: Map<string, string>,
  ): Promise<FAQPage[]> {
    const faqPages: FAQPage[] = [];

    for (const cluster of clusters) {
      const briefTitle = contentBriefs?.get(cluster.id) || undefined;
      const faqPage = await this.generateFAQPage(cluster, briefTitle);
      faqPages.push(faqPage);

      // Add delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return faqPages;
  }

  /**
   * Build prompt for FAQ generation
   */
  private buildFAQPrompt(cluster: Cluster, contentBriefTitle?: string): string {
    const keywords = cluster.keywords.slice(0, 15).join(", ");

    return `You are an expert content creator specializing in FAQ pages. Generate comprehensive FAQ content for the following topic.

Topic: "${cluster.pillarKeyword}"
Related Keywords: ${keywords}
Content Type: FAQ Page
${contentBriefTitle ? `Main Content Title: "${contentBriefTitle}"` : ""}

Create a complete FAQ page in JSON format:
{
  "pageTitle": "FAQs About [Topic] - Comprehensive Q&A Guide",
  "introduction": "A compelling introduction paragraph explaining what the FAQ covers",
  "faqs": [
    {
      "question": "A clear, specific question users would ask",
      "answer": "A comprehensive, helpful answer (100-200 words)",
      "relatedKeywords": ["keyword1", "keyword2"],
      "difficulty": "beginner"
    }
  ],
  "conclusion": "A closing paragraph summarizing key points and next steps",
  "relatedTopics": ["Topic 1", "Topic 2", "Topic 3"]
}

Requirements:
1. Generate 8-12 FAQ pairs covering the topic comprehensively
2. Start with beginner-friendly questions, progress to advanced
3. Make questions natural and conversational (how people actually search)
4. Provide detailed, actionable answers
5. Include 2-3 related keywords per answer
6. Vary difficulty levels: beginner (3-4), intermediate (3-4), advanced (2-3)
7. Ensure answers are optimized for featured snippets (under 60 words for key Q&A)
8. Include related topics for internal linking

Return ONLY valid JSON, no markdown formatting or explanations.`;
  }

  /**
   * Parse FAQ response from Claude
   */
  private parseFAQResponse(response: string, cluster: Cluster): FAQPage {
    try {
      let jsonStr = response;
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      return {
        clusterId: cluster.id,
        pillarKeyword: cluster.pillarKeyword,
        faqs: this.validateAndCleanFAQs(parsed.faqs || []),
        pageTitle:
          parsed.pageTitle ||
          `FAQs About ${cluster.pillarKeyword} - Complete Guide`,
        introduction:
          parsed.introduction || this.generateDefaultIntroduction(cluster),
        conclusion:
          parsed.conclusion || this.generateDefaultConclusion(cluster),
        relatedTopics: parsed.relatedTopics || [],
        generatedAt: Date.now(),
      };
    } catch (error) {
      console.error("Error parsing FAQ response:", error);
      return this.createDefaultFAQPage(cluster);
    }
  }

  /**
   * Validate and clean FAQ data
   */
  private validateAndCleanFAQs(faqs: any[]): FAQPair[] {
    return faqs
      .map((faq) => ({
        question: faq.question || "",
        answer: faq.answer || "",
        relatedKeywords: Array.isArray(faq.relatedKeywords)
          ? faq.relatedKeywords
          : [],
        difficulty: this.validateDifficulty(faq.difficulty),
      }))
      .filter((faq) => faq.question && faq.answer);
  }

  /**
   * Validate difficulty level
   */
  private validateDifficulty(
    difficulty: any,
  ): "beginner" | "intermediate" | "advanced" {
    const valid = ["beginner", "intermediate", "advanced"];
    return valid.includes(difficulty) ? difficulty : "beginner";
  }

  /**
   * Generate default FAQ page
   */
  private createDefaultFAQPage(cluster: Cluster): FAQPage {
    return {
      clusterId: cluster.id,
      pillarKeyword: cluster.pillarKeyword,
      faqs: this.generateDefaultFAQs(cluster),
      pageTitle: `FAQs About ${cluster.pillarKeyword} - Comprehensive Guide`,
      introduction: this.generateDefaultIntroduction(cluster),
      conclusion: this.generateDefaultConclusion(cluster),
      relatedTopics: cluster.keywords.slice(0, 3),
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate default FAQs based on keyword analysis
   */
  private generateDefaultFAQs(cluster: Cluster): FAQPair[] {
    const faqs: FAQPair[] = [
      {
        question: `What is ${cluster.pillarKeyword}?`,
        answer: `${cluster.pillarKeyword} is a topic of interest to many people. It covers a wide range of concepts and practices. Understanding the fundamentals is essential for anyone looking to learn more about this subject. The key is to start with basic concepts and gradually build your knowledge.`,
        relatedKeywords: [
          cluster.pillarKeyword,
          `${cluster.pillarKeyword} definition`,
        ],
        difficulty: "beginner",
      },
      {
        question: `How do I get started with ${cluster.pillarKeyword}?`,
        answer: `Getting started with ${cluster.pillarKeyword} is easier than you might think. Begin by understanding the basics, then gradually explore more advanced topics. Here's a simple approach: 1) Learn the fundamentals, 2) Practice with real examples, 3) Join a community to learn from others, 4) Continue learning and improving your skills.`,
        relatedKeywords: [`learn ${cluster.pillarKeyword}`, "getting started"],
        difficulty: "beginner",
      },
      {
        question: `What are the benefits of ${cluster.pillarKeyword}?`,
        answer: `There are several significant benefits to understanding and implementing ${cluster.pillarKeyword}. These include improved efficiency, better outcomes, increased knowledge, and personal growth. Many people report positive changes in their approach after engaging with ${cluster.pillarKeyword}. The benefits extend both professionally and personally.`,
        relatedKeywords: ["benefits", "advantages", "why important"],
        difficulty: "intermediate",
      },
      {
        question: `What are common mistakes in ${cluster.pillarKeyword}?`,
        answer: `Many people make common mistakes when first encountering ${cluster.pillarKeyword}. The most frequent errors include overlooking fundamentals, rushing through learning, not practicing enough, and not seeking help when stuck. Avoiding these mistakes will significantly accelerate your progress and improve your results.`,
        relatedKeywords: ["mistakes", "avoid", "tips"],
        difficulty: "intermediate",
      },
      {
        question: `How can I improve my ${cluster.pillarKeyword} skills?`,
        answer: `Improving your skills in ${cluster.pillarKeyword} requires consistent practice and learning. Focus on these key areas: regular practice with real examples, studying best practices, learning from experts, staying updated with new developments, and applying what you learn. Dedication and continuous improvement are key to mastery.`,
        relatedKeywords: ["improve", "tips", "best practices"],
        difficulty: "advanced",
      },
    ];

    return faqs;
  }

  /**
   * Generate default introduction
   */
  private generateDefaultIntroduction(cluster: Cluster): string {
    return `Welcome to our comprehensive FAQ section about ${cluster.pillarKeyword}. Whether you're a beginner just starting out or someone looking to deepen your knowledge, you'll find answers to the most common questions here. This resource is designed to help you navigate ${cluster.pillarKeyword} with clarity and confidence. Our FAQs cover everything from basic concepts to advanced strategies.`;
  }

  /**
   * Generate default conclusion
   */
  private generateDefaultConclusion(cluster: Cluster): string {
    return `We hope this FAQ section has been helpful in answering your questions about ${cluster.pillarKeyword}. If you have additional questions not covered here, feel free to reach out. Remember that learning ${cluster.pillarKeyword} is an ongoing journey, and continuous improvement is part of the process. Keep exploring, practicing, and growing your expertise.`;
  }
}
