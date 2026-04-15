import { getDatabase } from "../db/client";
import { usageLog } from "../db/schema";
import { eq, gte, sql, count, sum, and } from "drizzle-orm";

interface UserUsage {
  userId: number;
  totalTokensUsed: number;
  totalCost: number;
  analysisCount: number;
  lastAnalysisAt?: Date;
  monthlyLimit?: number;
  remaining: number;
}

interface TokenCost {
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

/**
 * Track Claude API usage per user
 * Pricing: $3 / 1M input tokens, $15 / 1M output tokens
 */
export class UsageTrackingService {
  private inputTokenPrice = 0.000003; // $3 per 1M tokens
  private outputTokenPrice = 0.000015; // $15 per 1M tokens
  private monthlyLimitTokens = 1000000; // 1M tokens per month for free tier

  /**
   * Calculate cost for tokens
   */
  calculateCost(inputTokens: number, outputTokens: number): TokenCost {
    const inputCost = inputTokens * this.inputTokenPrice;
    const outputCost = outputTokens * this.outputTokenPrice;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens,
      outputTokens,
      costUSD: parseFloat(totalCost.toFixed(6)),
    };
  }

  /**
   * Record token usage for analysis
   */
  async recordUsage(
    userId: number,
    inputTokens: number,
    outputTokens: number,
    analysisType?: string,
  ): Promise<void> {
    const cost = this.calculateCost(inputTokens, outputTokens);

    try {
      const db = getDatabase();
      await db.insert(usageLog).values({
        userId,
        inputTokens,
        outputTokens,
        costUSD: cost.costUSD.toString(),
        analysisType,
        recordedAt: new Date(),
      });

      console.log(
        `[Usage] User ${userId}: ${inputTokens + outputTokens} tokens ($${cost.costUSD})`,
      );
    } catch (error) {
      console.error("[Usage] Failed to record usage:", error);
      throw error;
    }
  }

  /**
   * Get user's monthly usage
   */
  async getMonthlyUsage(userId: number): Promise<UserUsage> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      const db = getDatabase();

      // Query total tokens and analysis count for this month
      const result = await db
        .select({
          totalInput: sum(usageLog.inputTokens),
          totalOutput: sum(usageLog.outputTokens),
          count: count(),
          lastRecorded: sql`MAX(${usageLog.recordedAt})`,
        })
        .from(usageLog)
        .where(
          and(
            eq(usageLog.userId, userId),
            gte(usageLog.recordedAt, monthStart),
          ),
        );

      const row = result[0];
      const totalInput = Number(row?.totalInput) || 0;
      const totalOutput = Number(row?.totalOutput) || 0;
      const totalTokensUsed = totalInput + totalOutput;
      const analysisCount = Number(row?.count) || 0;
      const lastAnalysisAt = row?.lastRecorded
        ? new Date(row.lastRecorded as string)
        : undefined;

      const cost = this.calculateCost(totalInput, totalOutput);

      return {
        userId,
        totalTokensUsed,
        totalCost: cost.costUSD,
        analysisCount,
        lastAnalysisAt,
        monthlyLimit: this.monthlyLimitTokens,
        remaining: Math.max(0, this.monthlyLimitTokens - totalTokensUsed),
      };
    } catch (error) {
      console.error("[Usage] Failed to get monthly usage:", error);
      // Return zero usage on error
      return {
        userId,
        totalTokensUsed: 0,
        totalCost: 0,
        analysisCount: 0,
        monthlyLimit: this.monthlyLimitTokens,
        remaining: this.monthlyLimitTokens,
      };
    }
  }

  /**
   * Check if user has quota remaining
   */
  async hasQuota(
    userId: number,
    requiredTokens: number = 10000,
  ): Promise<boolean> {
    const usage = await this.getMonthlyUsage(userId);
    return usage.remaining >= requiredTokens;
  }

  /**
   * Get token estimate for text length
   */
  estimateTokens(text: string): number {
    // Rough estimate: 1 token ~= 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Set pricing (admin)
   */
  setPricing(
    inputPricePerMillion: number,
    outputPricePerMillion: number,
  ): void {
    this.inputTokenPrice = inputPricePerMillion / 1000000;
    this.outputTokenPrice = outputPricePerMillion / 1000000;

    console.log("[Usage] Updated pricing:", {
      inputTokenPrice: this.inputTokenPrice,
      outputTokenPrice: this.outputTokenPrice,
    });
  }

  /**
   * Get current pricing
   */
  getPricing() {
    return {
      inputTokensPer1M: this.inputTokenPrice * 1000000,
      outputTokensPer1M: this.outputTokenPrice * 1000000,
    };
  }

  /**
   * Generate usage report
   */
  async getUserReport(userId: number): Promise<string> {
    const usage = await this.getMonthlyUsage(userId);
    const pricing = this.getPricing();

    return `
SEO Crawler - Usage Report
User ID: ${usage.userId}
Period: This Month

Tokens Used: ${usage.totalTokensUsed.toLocaleString()}
Analyses: ${usage.analysisCount}
Estimated Cost: $${usage.totalCost}

Monthly Limit: ${(usage.monthlyLimit ?? this.monthlyLimitTokens).toLocaleString()} tokens
Remaining: ${usage.remaining.toLocaleString()} tokens

Pricing:
- Input: $${pricing.inputTokensPer1M} per 1M tokens
- Output: $${pricing.outputTokensPer1M} per 1M tokens
    `.trim();
  }
}

// Singleton instance
export const usageTracker = new UsageTrackingService();
