import Anthropic from "@anthropic-ai/sdk";
import { redisService } from "./redisService";
import { metricsService } from "./metricsService";

interface AnalysisResult {
  type: "difficulty_insights" | "roi_opportunities" | "competitor_gaps";
  content: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  model: string;
}

export class ClaudeAnalysisService {
  private client: Anthropic;
  private model: string = "claude-3-sonnet-20240229";

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }

    this.client = new Anthropic({
      apiKey,
    });
  }

  /**
   * Analyze keyword difficulty and provide insights
   */
  async analyzeDifficulty(
    keywords: string[],
    sources: string[],
    jobId?: string,
  ): Promise<AnalysisResult> {
    const prompt = `
Analyze the SEO difficulty for these keywords: ${keywords.join(", ")}

Based on the search sources: ${sources.join(", ")}

Provide insights on:
1. Overall difficulty level (low/medium/high)
2. Search volume estimation
3. Competition analysis
4. Recommended targeting strategy
5. Potential low-hanging fruit keywords

Format: Professional SEO analysis in 3-4 paragraphs
`;

    const cacheKey = jobId
      ? `analysis:${jobId}:difficulty_insights`
      : undefined;
    return this.callClaude(prompt, "difficulty_insights", cacheKey);
  }

  /**
   * Identify ROI opportunities
   */
  async analyzeROI(
    keywords: string[],
    resultCounts: Map<string, number>,
    jobId?: string,
  ): Promise<AnalysisResult> {
    const keywordData = Array.from(resultCounts.entries())
      .map(([kw, count]) => `${kw}: ${count} results`)
      .join("\n");

    const prompt = `
ROI Analysis for SEO Keywords:

${keywordData}

Total keywords analyzed: ${keywords.length}

Provide recommendations for:
1. High-ROI keywords to prioritize
2. Quick wins (fast-to-rank keywords)
3. Content opportunities
4. Estimated traffic potential
5. Resource allocation strategy

Format: Business-focused analysis with actionable recommendations
`;

    const cacheKey = jobId ? `analysis:${jobId}:roi_opportunities` : undefined;
    return this.callClaude(prompt, "roi_opportunities", cacheKey);
  }

  /**
   * Analyze competitor gaps
   */
  async analyzeCompetitorGaps(
    keywords: string[],
    competitors: string[],
    jobId?: string,
  ): Promise<AnalysisResult> {
    const prompt = `
Competitive Analysis for SEO Strategy:

Target Keywords: ${keywords.join(", ")}
Competitors: ${competitors.join(", ")}

Analyze:
1. Content gaps in competitor targeting
2. Untapped keyword opportunities
3. Potential differentiation angles
4. Traffic capture opportunities
5. Market positioning recommendations

Format: Strategic analysis with specific opportunities to outrank competitors
`;

    const cacheKey = jobId ? `analysis:${jobId}:competitor_gaps` : undefined;
    return this.callClaude(prompt, "competitor_gaps", cacheKey);
  }

  /**
   * Call Claude API with streaming (with caching)
   */
  private async callClaude(
    prompt: string,
    analysisType:
      | "difficulty_insights"
      | "roi_opportunities"
      | "competitor_gaps",
    cacheKey?: string,
  ): Promise<AnalysisResult> {
    try {
      // Check cache first
      if (cacheKey) {
        const cachedResult =
          await redisService.getJson<AnalysisResult>(cacheKey);
        if (cachedResult) {
          metricsService.recordCacheHit(cacheKey);
          return cachedResult;
        }
        metricsService.recordCacheMiss(cacheKey);
      }

      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Stream the response
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const delta = event.delta as any;
          if (delta.type === "text_delta") {
            fullContent += delta.text;
          }
        }
      }

      // Get final message for token counts
      const finalMessage = await stream.finalMessage();
      const usage = finalMessage.usage;
      inputTokens = usage.input_tokens;
      outputTokens = usage.output_tokens;

      const result: AnalysisResult = {
        type: analysisType,
        content: fullContent,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        model: this.model,
      };

      // Cache the result for 1 hour
      if (cacheKey) {
        await redisService.setJson(cacheKey, result, 3600);
      }

      return result;
    } catch (error) {
      console.error("[Claude API] Error:", error);
      throw error;
    }
  }

  /**
   * Get model info
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Check API connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: "Say OK",
          },
        ],
      });

      return response.content.length > 0;
    } catch (error) {
      console.error("[Claude API] Health check failed:", error);
      return false;
    }
  }
}

// Singleton instance
let instance: ClaudeAnalysisService | null = null;

/**
 * Get or create ClaudeAnalysisService instance
 */
export function getClaudeService(): ClaudeAnalysisService {
  if (!instance) {
    instance = new ClaudeAnalysisService();
  }
  return instance;
}
