/**
 * Keyword Job Worker Service
 * Orchestrates async processing of keyword jobs with checkpoint recovery
 */

import { db } from "../db/index.js";
import {
  keywordJobs,
  keywordCandidates,
  keywordFeatures,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { KeywordExpansionService } from "./expansionService.js";
import { NormalizationService } from "./normalizationService.js";
import { ClassificationService } from "./classificationService.js";
import { TrendService } from "./trendService.js";
import { SerpService } from "./serpService.js";
import {
  KeywordJobConfig,
  KeywordJobCheckpoint,
  JobStatus,
} from "../types/job.js";
import { TrendData } from "../types/trend.js";
import { WebhookDeliveryService } from "./webhookDeliveryService.js";
import { projects } from "../db/schema.js";

const DEFAULT_CONFIG: KeywordJobConfig = {
  expandDepth: 1,
  maxCandidatesPerStrategy: 100,
  totalMaxCandidates: 1000,
  strategies: [
    "original",
    "space_modifier",
    "a_z_suffix",
    "numeric_suffix",
    "question_modifiers",
    "comparison_modifiers",
    "commercial_modifiers",
    "scenario_modifiers",
  ],
  enableSerpAnalysis: false, // Phase 2
  enableTrendDetection: true, // Phase 4.2: enabled
  deduplication: true,
};

export class JobWorkerService {
  /**
   * Process a keyword job from start or resume from checkpoint
   */
  static async processJob(jobId: string): Promise<void> {
    const job = await db
      .select()
      .from(keywordJobs)
      .where(eq(keywordJobs.id, jobId))
      .limit(1);

    if (!job.length) {
      throw new Error(`Job ${jobId} not found`);
    }

    const jobRecord = job[0];
    const config = {
      ...DEFAULT_CONFIG,
      ...JSON.parse(jobRecord.configJson),
    } as KeywordJobConfig;

    try {
      // Update status to processing
      await db
        .update(keywordJobs)
        .set({ status: "processing" as JobStatus })
        .where(eq(keywordJobs.id, jobId));

      // Get seed keywords
      const seedKeywords = JSON.parse(jobRecord.seedKeywords) as string[];

      // Phase 1: Expansion
      console.log(`[${jobId}] Starting expansion phase`);
      const candidates = await this.expandKeywords(jobId, seedKeywords, config);
      console.log(`[${jobId}] Expanded to ${candidates.length} candidates`);

      // Phase 2: Normalization
      console.log(`[${jobId}] Starting normalization phase`);
      const normalized = await this.normalizeKeywords(
        jobId,
        candidates,
        config,
      );
      console.log(
        `[${jobId}] Normalized to ${normalized.length} unique keywords`,
      );

      // Update checkpoint
      await this.updateCheckpoint(jobId, "normalization", normalized.length);

      // Phase 3: Classification
      console.log(`[${jobId}] Starting classification phase`);
      await this.classifyKeywords(jobId, normalized, config);
      console.log(`[${jobId}] Classification completed`);

      // Update checkpoint to completed
      await this.updateCheckpoint(jobId, "completed", normalized.length);

      // Update job status
      await db
        .update(keywordJobs)
        .set({
          status: "completed" as JobStatus,
          checkpointCount: jobRecord.checkpointCount + 1,
        })
        .where(eq(keywordJobs.id, jobId));

      console.log(`[${jobId}] Job completed successfully`);

      // Dispatch webhook on job completion
      setImmediate(async () => {
        try {
          const projectRecord = await db.query.projects.findFirst({
            where: (projects, { eq }) => eq(projects.id, jobRecord.projectId),
          });
          
          if (projectRecord) {
            await WebhookDeliveryService.dispatch(
              "job.completed",
              {
                jobId,
                projectId: jobRecord.projectId,
                status: "completed",
                candidateCount: normalized.length,
              },
              projectRecord.ownerId
            );
          }
        } catch (err) {
          console.error(`[${jobId}] Failed to dispatch completion webhook:`, err);
        }
      });
    } catch (error) {
      // Update job status to failed
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await db
        .update(keywordJobs)
        .set({
          status: "failed" as JobStatus,
        })
        .where(eq(keywordJobs.id, jobId));

      console.error(`[${jobId}] Job failed:`, errorMessage);

      // Dispatch webhook on job failure
      setImmediate(async () => {
        try {
          const projectRecord = await db.query.projects.findFirst({
            where: (projects, { eq }) => eq(projects.id, jobRecord.projectId),
          });
          
          if (projectRecord) {
            await WebhookDeliveryService.dispatch(
              "job.failed",
              {
                jobId,
                projectId: jobRecord.projectId,
                status: "failed",
                error: errorMessage,
              },
              projectRecord.ownerId
            );
          }
        } catch (err) {
          console.error(`[${jobId}] Failed to dispatch failure webhook:`, err);
        }
      });
      
      throw error;
    }
  }

  /**
   * Expand seed keywords using configured strategies
   */
  private static async expandKeywords(
    jobId: string,
    seedKeywords: string[],
    config: KeywordJobConfig,
  ): Promise<string[]> {
    const allCandidates: string[] = [];

    for (const seed of seedKeywords) {
      const expandedConfig = {
        strategies: config.strategies,
        maxCandidatesPerStrategy: config.maxCandidatesPerStrategy,
        totalMaxCandidates: config.totalMaxCandidates,
      };

      const candidates = KeywordExpansionService.expandKeyword(
        seed,
        expandedConfig,
      );
      allCandidates.push(...candidates);

      // Store raw candidates with depth=0 (direct expansion from seed)
      for (const candidate of candidates) {
        try {
          await db.insert(keywordCandidates).values({
            jobId,
            rawKeyword: candidate,
            normalizedKeyword: "", // Will be filled during normalization
            parentKeyword: seed,
            sourceType: "expansion",
            depth: 0,
            collectedAt: new Date(),
          });
        } catch (e) {
          // Ignore duplicates (unique constraint on job_id+normalized_keyword+depth)
          // We'll handle deduplication in normalization phase
        }
      }
    }

    return allCandidates;
  }

  /**
   * Normalize keywords and deduplicate
   */
  private static async normalizeKeywords(
    jobId: string,
    candidates: string[],
    config: KeywordJobConfig,
  ): Promise<string[]> {
    const normalized = new Set<string>();

    // Get all candidates for this job
    const rows = await db
      .select()
      .from(keywordCandidates)
      .where(eq(keywordCandidates.jobId, jobId));

    for (const row of rows) {
      const normLog = NormalizationService.normalize(row.rawKeyword);

      // Skip invalid keywords
      if (!NormalizationService.isValid(normLog.normalizedKeyword)) {
        continue;
      }

      // Update candidate with normalized form
      await db
        .update(keywordCandidates)
        .set({
          normalizedKeyword: normLog.normalizedKeyword,
        })
        .where(eq(keywordCandidates.id, row.id!));

      normalized.add(normLog.normalizedKeyword);
    }

    return Array.from(normalized);
  }

  /**
   * Classify normalized keywords
   */
  private static async classifyKeywords(
    jobId: string,
    normalizedKeywords: string[],
    config: KeywordJobConfig,
  ): Promise<void> {
    // Get all unique normalized keywords for this job
    const uniqueKeywords = await db
      .selectDistinct({
        normalizedKeyword: keywordCandidates.normalizedKeyword,
        id: keywordCandidates.id,
      })
      .from(keywordCandidates)
      .where(eq(keywordCandidates.jobId, jobId));

    // Batch fetch trend data if enabled
    const trendData: Record<string, TrendData> = {};
    if (config.enableTrendDetection && uniqueKeywords.length > 0) {
      const keywordsToCheck = uniqueKeywords
        .map((kw) => kw.normalizedKeyword)
        .filter((kw) => kw);

      const trends = await TrendService.getTrendDataBatch(keywordsToCheck);
      for (const [keyword, trend] of Object.entries(trends)) {
        trendData[keyword] = trend;
      }
    }

    // Batch fetch SERP data if enabled
    const serpData: Record<string, number> = {};
    if (config.enableSerpAnalysis && uniqueKeywords.length > 0) {
      const keywordsToCheck = uniqueKeywords
        .map((kw) => kw.normalizedKeyword)
        .filter((kw) => kw);

      const serp = await SerpService.analyzeBatch(keywordsToCheck);
      for (const [keyword, analysis] of Object.entries(serp)) {
        serpData[keyword] = analysis.competitionScore;
      }
    }

    for (const row of uniqueKeywords) {
      if (!row.normalizedKeyword) continue;

      const classification = ClassificationService.classify(
        row.normalizedKeyword,
      );

      const trendInfo = trendData[row.normalizedKeyword];
      const trendLabel = trendInfo?.label ?? "unknown";
      const competitionScore = serpData[row.normalizedKeyword] || 0;

      // Insert classification features
      await db.insert(keywordFeatures).values({
        keywordId: row.id,
        wordCount: classification.wordCount,
        intentPrimary: classification.intentPrimary,
        intentSecondary: classification.intentSecondary,
        funnelStage: classification.funnelStage,
        keywordType: classification.keywordType,
        contentFormatRecommendation: classification.contentFormatRecommendation,
        trendLabel: trendLabel as any,
        trendConfidence: trendInfo?.confidence ?? 0,
        trendDirection: trendInfo?.direction ?? 0,
        competitionScore,
        opportunityScore: this.calculateOpportunityScore(
          classification,
          competitionScore,
          trendInfo,
        ),
        confidenceScore: classification.confidenceScore,
      });
    }
  }

  /**
   * Calculate opportunity score for a keyword
   * Score: 0-100 based on classification dimensions, competition, and trends
   */
  private static calculateOpportunityScore(
    classification: any,
    competitionScore: number = 0,
    trendData?: TrendData,
  ): number {
    let score = 50; // Base score

    // Funnel stage value
    const funnelValue: Record<string, number> = {
      awareness: 20,
      consideration: 30,
      decision: 40,
    };
    score += funnelValue[classification.funnelStage] || 0;

    // Intent value
    const intentValue: Record<string, number> = {
      informational: 10,
      commercial: 20,
      transactional: 30,
      navigational: 5,
    };
    score += intentValue[classification.intentPrimary] || 0;

    // Confidence boost
    score += Math.floor(classification.confidenceScore * 10);

    // Lower competition = higher opportunity
    // If competition is 100 (very competitive), subtract 30 points
    // If competition is 0 (no competition), add 0 points
    if (competitionScore > 0) {
      const competitionPenalty = Math.floor((competitionScore / 100) * 30);
      score -= competitionPenalty;
    }

    // Trend modifier: ±10 * confidence
    if (trendData) {
      const trendBonus: Record<string, number> = {
        rising: 10,
        seasonal: 5,
        stable: 0,
        declining: -10,
        unknown: 0,
      };
      const bonus = trendBonus[trendData.label] ?? 0;
      // Weight by confidence so low-confidence trends have less impact
      score += Math.round(bonus * trendData.confidence);
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Update checkpoint with current progress
   */
  private static async updateCheckpoint(
    jobId: string,
    stage: string,
    processedCount: number,
  ): Promise<void> {
    const checkpoint: KeywordJobCheckpoint = {
      stage: stage as any,
      processedCount,
      timestamp: Date.now(),
    };

    await db
      .update(keywordJobs)
      .set({
        checkpointCount:
          (
            await db.select().from(keywordJobs).where(eq(keywordJobs.id, jobId))
          )[0].checkpointCount + 1,
      })
      .where(eq(keywordJobs.id, jobId));
  }

  /**
   * Get job status with results
   */
  static async getJobStatus(jobId: string) {
    const job = await db
      .select()
      .from(keywordJobs)
      .where(eq(keywordJobs.id, jobId))
      .limit(1);

    if (!job.length) {
      throw new Error(`Job ${jobId} not found`);
    }

    const jobRecord = job[0];

    // Get candidate count
    const candidates = await db
      .select()
      .from(keywordCandidates)
      .where(eq(keywordCandidates.jobId, jobId));

    // Get unique normalized keywords with classifications
    const classified = await db
      .selectDistinct({
        normalizedKeyword: keywordCandidates.normalizedKeyword,
      })
      .from(keywordCandidates)
      .where(eq(keywordCandidates.jobId, jobId));

    return {
      jobId,
      projectId: jobRecord.projectId,
      status: jobRecord.status,
      seedKeywords: JSON.parse(jobRecord.seedKeywords),
      totalCandidates: candidates.length,
      processedCount: classified.length,
      errorCount: 0,
      startedAt: jobRecord.createdAt.getTime(),
      completedAt: jobRecord.status === "completed" ? Date.now() : null,
      currentCheckpoint: null,
    };
  }
}
