/**
 * Export Service
 * Generates CSV and JSON exports for keyword results
 */

import { db } from "../db/index.js";
import { keywordCandidates, keywordFeatures } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface ExportOptions {
  format: "csv" | "json";
  includeColumns?: string[];
  delimiter?: string; // For CSV
}

export interface KeywordExportRow {
  keyword: string;
  wordCount: number;
  intentPrimary: string;
  intentSecondary?: string;
  funnelStage: string;
  contentFormatRecommendation: string;
  competitionScore: number;
  opportunityScore: number;
  confidenceScore: number;
  trendLabel: string;
}

const DEFAULT_COLUMNS = [
  "keyword",
  "wordCount",
  "intentPrimary",
  "intentSecondary",
  "funnelStage",
  "contentFormatRecommendation",
  "competitionScore",
  "opportunityScore",
  "confidenceScore",
  "trendLabel",
];

export class ExportService {
  /**
   * Get data for export
   */
  static async getExportData(jobId: string): Promise<KeywordExportRow[]> {
    const results = await db
      .select({
        normalizedKeyword: keywordCandidates.normalizedKeyword,
        wordCount: keywordFeatures.wordCount,
        intentPrimary: keywordFeatures.intentPrimary,
        intentSecondary: keywordFeatures.intentSecondary,
        funnelStage: keywordFeatures.funnelStage,
        contentFormatRecommendation:
          keywordFeatures.contentFormatRecommendation,
        competitionScore: keywordFeatures.competitionScore,
        opportunityScore: keywordFeatures.opportunityScore,
        confidenceScore: keywordFeatures.confidenceScore,
        trendLabel: keywordFeatures.trendLabel,
      })
      .from(keywordCandidates)
      .innerJoin(
        keywordFeatures,
        eq(keywordFeatures.keywordId, keywordCandidates.id),
      )
      .where(eq(keywordCandidates.jobId, jobId));

    return results.map((r) => ({
      keyword: r.normalizedKeyword || "",
      wordCount: r.wordCount || 0,
      intentPrimary: r.intentPrimary || "unknown",
      intentSecondary: r.intentSecondary || undefined,
      funnelStage: r.funnelStage || "awareness",
      contentFormatRecommendation: r.contentFormatRecommendation || "article",
      competitionScore: r.competitionScore || 0,
      opportunityScore: r.opportunityScore || 0,
      confidenceScore: r.confidenceScore || 0,
      trendLabel: r.trendLabel || "unknown",
    }));
  }

  /**
   * Export to CSV format
   */
  static async exportCsv(
    jobId: string,
    options: Partial<ExportOptions> = {},
  ): Promise<string> {
    const columns = options.includeColumns || DEFAULT_COLUMNS;
    const delimiter = options.delimiter || ",";

    const data = await this.getExportData(jobId);

    // Build CSV header
    const header = columns.join(delimiter);

    // Build CSV rows
    const rows = data.map((row) => {
      return columns
        .map((col) => {
          const value = row[col as keyof KeywordExportRow] ?? "";
          // Escape quotes and wrap in quotes if contains delimiter or newline
          const stringValue = String(value);
          if (
            stringValue.includes(delimiter) ||
            stringValue.includes("\n") ||
            stringValue.includes('"')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(delimiter);
    });

    return [header, ...rows].join("\n");
  }

  /**
   * Export to JSON format
   */
  static async exportJson(jobId: string): Promise<string> {
    const data = await this.getExportData(jobId);

    return JSON.stringify(
      {
        jobId,
        exportedAt: new Date().toISOString(),
        totalKeywords: data.length,
        keywords: data,
      },
      null,
      2,
    );
  }

  /**
   * Export to JSON Lines format (one JSON object per line)
   */
  static async exportJsonl(jobId: string): Promise<string> {
    const data = await this.getExportData(jobId);

    return data.map((row) => JSON.stringify(row)).join("\n");
  }

  /**
   * Get export filename
   */
  static getFilename(jobId: string, format: string): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    return `keywords_${jobId}_${timestamp}.${format === "json" ? "json" : format === "jsonl" ? "jsonl" : "csv"}`;
  }

  /**
   * Get statistics about the dataset
   */
  static async getExportStats(jobId: string) {
    const data = await this.getExportData(jobId);

    if (data.length === 0) {
      return {
        totalKeywords: 0,
        avgWordCount: 0,
        avgCompetitionScore: 0,
        avgOpportunityScore: 0,
        intentDistribution: {},
        funnelDistribution: {},
        contentFormatDistribution: {},
      };
    }

    const avgWordCount =
      data.reduce((sum, r) => sum + r.wordCount, 0) / data.length;
    const avgCompetitionScore =
      data.reduce((sum, r) => sum + r.competitionScore, 0) / data.length;
    const avgOpportunityScore =
      data.reduce((sum, r) => sum + r.opportunityScore, 0) / data.length;

    const intentDistribution = this.countDistribution(data, "intentPrimary");
    const funnelDistribution = this.countDistribution(data, "funnelStage");
    const contentFormatDistribution = this.countDistribution(
      data,
      "contentFormatRecommendation",
    );

    return {
      totalKeywords: data.length,
      avgWordCount: parseFloat(avgWordCount.toFixed(2)),
      avgCompetitionScore: parseFloat(avgCompetitionScore.toFixed(2)),
      avgOpportunityScore: parseFloat(avgOpportunityScore.toFixed(2)),
      intentDistribution,
      funnelDistribution,
      contentFormatDistribution,
    };
  }

  /**
   * Helper: count distribution of values for a key
   */
  private static countDistribution(
    data: KeywordExportRow[],
    key: keyof KeywordExportRow,
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const row of data) {
      const value = String(row[key] || "unknown");
      distribution[value] = (distribution[value] || 0) + 1;
    }

    return distribution;
  }
}
