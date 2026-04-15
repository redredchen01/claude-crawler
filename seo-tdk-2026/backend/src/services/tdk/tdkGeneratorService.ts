/**
 * TDK Generator Service
 *
 * Generates Title, Description, and Keywords recommendations using Claude API.
 * Produces a primary recommendation + 2-3 alternatives for user choice.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Language } from "./tdkRules";

/**
 * Single TDK candidate (Title, Description, Keywords)
 */
export interface TdkCandidate {
  title: string;
  description: string;
  keywords: string[];
}

/**
 * Generation result with metadata
 */
export interface TdkGenerationResult {
  primary: TdkCandidate;
  alternatives: TdkCandidate[];
  metadata: {
    generatedAt: Date;
    language: Language;
    modelVersion: string;
    tokensUsed: number;
  };
}

/**
 * Configuration for generation
 */
export interface GenerationConfig {
  model?: string;
  maxTokens?: number;
  timeout?: number;
  temperature?: number;
}

/**
 * TDK Generator Service
 *
 * Calls Claude API to generate multiple TDK candidates based on topic, keywords, and content.
 */
export class TdkGeneratorService {
  private client: Anthropic;
  private config: Required<GenerationConfig>;

  constructor(config?: GenerationConfig) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      model: config?.model || "claude-opus-4-6",
      maxTokens: config?.maxTokens || 1500,
      timeout:
        config?.timeout ||
        parseInt(process.env.TDK_GENERATION_TIMEOUT_MS || "5000", 10),
      temperature: config?.temperature || 0.7,
    };
  }

  /**
   * Generate TDK recommendations
   *
   * @param topic - Main topic/subject of the page (e.g., "Python programming tutorial")
   * @param keywords - Primary keywords to focus on (e.g., ["Python", "tutorial", "beginner"])
   * @param contentSnippet - Optional content excerpt to ensure consistency
   * @param language - Target language ("en" or "zh")
   * @returns Generation result with primary + alternatives
   */
  async generateRecommendations(
    topic: string,
    keywords: string[],
    contentSnippet?: string,
    language: Language = "en",
  ): Promise<TdkGenerationResult> {
    // Validate input
    if (!topic || topic.trim().length === 0) {
      throw new Error("Topic is required");
    }

    const trimmedTopic = topic.trim();
    const trimmedKeywords = keywords.filter((kw) => kw && kw.trim().length > 0);

    // Build the prompt
    const prompt = this.buildPrompt(
      trimmedTopic,
      trimmedKeywords,
      contentSnippet,
      language,
    );

    try {
      // Call Claude API
      const message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract and parse response
      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      const parsed = this.parseResponse(responseText);

      // Build result with metadata
      return {
        primary: parsed.primary,
        alternatives: parsed.alternatives,
        metadata: {
          generatedAt: new Date(),
          language,
          modelVersion: this.config.model,
          tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        },
      };
    } catch (error) {
      // Handle API errors gracefully
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to generate TDK recommendations: ${errorMessage}`,
      );
    }
  }

  /**
   * Build the Claude prompt for TDK generation
   */
  private buildPrompt(
    topic: string,
    keywords: string[],
    contentSnippet: string | undefined,
    language: Language,
  ): string {
    const isEnglish = language === "en";

    const lengthGuide = isEnglish
      ? `
Title: 50-60 characters (optimal), 30-70 characters (acceptable)
Meta Description: 150-160 characters (optimal), 100-200 characters (acceptable)
Keywords: 5-8 keywords, each 5-20 characters`
      : `
Title: 25-30 Chinese characters (optimal), 15-40 characters (acceptable)
Meta Description: 75-80 Chinese characters (optimal), 50-100 characters (acceptable)
Keywords: 5-8 keywords, each 2-10 Chinese characters`;

    const keywordsList =
      keywords.length > 0 ? keywords.join(", ") : "(primary topic keywords)";

    const contentContext = contentSnippet
      ? `

Content Summary:
${contentSnippet}`
      : "";

    const languageInstructions = isEnglish
      ? `
# Generation Instructions:
1. Title should naturally include the main keywords, placing them early in the title
2. Meta Description should be a natural summary that includes primary keywords
3. Keywords should be diverse and relevant, avoiding repetition
4. All text should be natural, not keyword-stuffed
5. Ensure high quality, professional tone`
      : `
# 生成指南：
1. 标题应自然包含核心关键词，将其置于标题前部
2. 摘要应是自然的总结，包含主要关键词
3. 关键词应多样化且相关，避免重复
4. 所有文本应自然流畅，无堆砌感
5. 保证高质量、专业的语气`;

    const instructionText = isEnglish
      ? `
Return a JSON object with this exact structure:
{
  "primary": {
    "title": "...",
    "description": "...",
    "keywords": ["...", "...", "..."]
  },
  "alternatives": [
    {"title": "...", "description": "...", "keywords": [...]},
    {"title": "...", "description": "...", "keywords": [...]},
    {"title": "...", "description": "...", "keywords": [...]}
  ]
}

Requirements:
- Generate exactly 1 primary and 2-3 alternatives
- Each candidate must be a complete, valid JSON object
- Title, description, and keywords must all be present
- Keywords array must contain strings
- Only return valid JSON, no extra text`
      : `
返回严格的 JSON 格式，结构如下：
{
  "primary": {
    "title": "...",
    "description": "...",
    "keywords": ["...", "...", "..."]
  },
  "alternatives": [
    {"title": "...", "description": "...", "keywords": [...]},
    {"title": "...", "description": "...", "keywords": [...]},
    {"title": "...", "description": "...", "keywords": [...]}
  ]
}

要求：
- 生成恰好 1 个主推荐和 2-3 个备选
- 每个候选必须是完整、有效的 JSON 对象
- title、description 和 keywords 必须全部存在
- keywords 数组必须包含字符串
- 仅返回有效 JSON，无额外文本`;

    return `${isEnglish ? "Page Topic:" : "页面主题："} ${topic}

${isEnglish ? "Primary Keywords:" : "核心关键词："} ${keywordsList}

${isEnglish ? "Length Requirements:" : "长度要求："}
${lengthGuide}${contentContext}

${languageInstructions}

${instructionText}`;
  }

  /**
   * Parse Claude response into TdkCandidate objects
   */
  private parseResponse(response: string): {
    primary: TdkCandidate;
    alternatives: TdkCandidate[];
  } {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.primary || !Array.isArray(parsed.alternatives)) {
      throw new Error(
        "Response missing required fields: primary or alternatives",
      );
    }

    // Validate primary
    const primary = this.validateCandidate(parsed.primary, "primary");

    // Validate alternatives
    const alternatives = parsed.alternatives
      .slice(0, 3) // Limit to 3 alternatives
      .map((alt: unknown, idx: number) =>
        this.validateCandidate(alt, `alternative[${idx}]`),
      );

    return { primary, alternatives };
  }

  /**
   * Validate and normalize a TDK candidate
   */
  private validateCandidate(candidate: unknown, label: string): TdkCandidate {
    if (typeof candidate !== "object" || candidate === null) {
      throw new Error(`${label}: candidate must be an object`);
    }

    const cand = candidate as Record<string, unknown>;

    const title = String(cand.title || "").trim();
    const description = String(cand.description || "").trim();
    const keywordsRaw = cand.keywords;

    if (!title) {
      throw new Error(`${label}: title is required`);
    }

    if (!description) {
      throw new Error(`${label}: description is required`);
    }

    let keywords: string[] = [];
    if (Array.isArray(keywordsRaw)) {
      keywords = keywordsRaw
        .map((kw) => String(kw).trim())
        .filter((kw) => kw.length > 0);
    }

    if (keywords.length === 0) {
      throw new Error(
        `${label}: keywords array must contain at least one keyword`,
      );
    }

    return { title, description, keywords };
  }
}

/**
 * Create a singleton instance (or multiple per config as needed)
 */
let serviceInstance: TdkGeneratorService | null = null;

export function getTdkGeneratorService(
  config?: GenerationConfig,
): TdkGeneratorService {
  if (!serviceInstance) {
    serviceInstance = new TdkGeneratorService(config);
  }
  return serviceInstance;
}
