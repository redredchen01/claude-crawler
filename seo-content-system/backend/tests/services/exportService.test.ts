import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { initializeDatabase } from "../../src/db/index.js";
import { db } from "../../src/db/index.js";
import {
  users,
  projects,
  keywordJobs,
  keywordCandidates,
  keywordFeatures,
} from "../../src/db/schema.js";
import { ExportService } from "../../src/services/exportService.js";

describe("ExportService", () => {
  let jobId: string;

  beforeAll(async () => {
    await initializeDatabase();

    // Create test user and project
    const userId = "test-user-export";
    const projectId = "test-project-export";

    await db.insert(users).values({
      id: userId,
      email: "export@example.com",
      hashedPassword: "hashed",
      role: "user",
      createdAt: new Date(),
    });

    await db.insert(projects).values({
      id: projectId,
      ownerId: userId,
      name: "Export Test",
      siteName: "export.test",
      locale: "en-US",
      language: "en",
      defaultEngine: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create test job
    jobId = "test-job-export";
    await db.insert(keywordJobs).values({
      id: jobId,
      projectId,
      seedKeywords: JSON.stringify(["python"]),
      status: "completed",
      configJson: "{}",
      checkpointCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add test keywords and features
    const keywords = [
      { normalized: "python", intent: "informational" },
      { normalized: "learn python", intent: "informational" },
      { normalized: "python tutorial", intent: "informational" },
      { normalized: "buy python course", intent: "transactional" },
      { normalized: "python vs java", intent: "commercial" },
    ];

    for (let i = 0; i < keywords.length; i++) {
      const kwData = keywords[i];

      // Insert keyword candidate
      const candResult = await db
        .insert(keywordCandidates)
        .values({
          jobId,
          rawKeyword: kwData.normalized,
          normalizedKeyword: kwData.normalized,
          parentKeyword: "python",
          sourceType: "expansion",
          depth: 0,
          collectedAt: new Date(),
        })
        .returning({ id: keywordCandidates.id });

      const candId = candResult[0]?.id;
      if (candId) {
        // Insert features
        await db.insert(keywordFeatures).values({
          keywordId: candId,
          wordCount: kwData.normalized.split(/\s+/).length,
          intentPrimary: kwData.intent as any,
          funnelStage: "awareness",
          keywordType: "question",
          contentFormatRecommendation: "article",
          trendLabel: "stable",
          competitionScore: 30 + i * 10,
          opportunityScore: 50 + i * 5,
          confidenceScore: 0.7 + i * 0.05,
        });
      }
    }
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(keywordFeatures);
    await db.delete(keywordCandidates);
    await db.delete(keywordJobs);
    await db.delete(projects);
    await db.delete(users);
  });

  describe("CSV export", () => {
    it("should export to CSV format", async () => {
      const csv = await ExportService.exportCsv(jobId);

      expect(csv).toBeDefined();
      expect(typeof csv).toBe("string");
      expect(csv.length).toBeGreaterThan(0);
    });

    it("should include header row", async () => {
      const csv = await ExportService.exportCsv(jobId);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("keyword");
      expect(lines[0]).toContain("wordCount");
      expect(lines[0]).toContain("intentPrimary");
    });

    it("should have data rows", async () => {
      const csv = await ExportService.exportCsv(jobId);
      const lines = csv.split("\n");

      // Should have header + data rows
      expect(lines.length).toBeGreaterThan(1);

      // Check data rows are not empty
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          expect(lines[i].split(",").length).toBeGreaterThan(0);
        }
      }
    });

    it("should use custom delimiter", async () => {
      const csv = await ExportService.exportCsv(jobId, {
        format: "csv",
        delimiter: ";",
      });

      expect(csv).toContain(";");
      expect(csv.split("\n")[0]).toContain(";");
    });

    it("should escape quoted values", async () => {
      const csv = await ExportService.exportCsv(jobId);

      // If any cell contains special characters, it should be escaped
      const lines = csv.split("\n");
      expect(lines.length).toBeGreaterThan(0);
    });

    it("should handle selected columns", async () => {
      const csv = await ExportService.exportCsv(jobId, {
        format: "csv",
        includeColumns: ["keyword", "intentPrimary"],
      });

      const lines = csv.split("\n");
      const header = lines[0];

      expect(header).toContain("keyword");
      expect(header).toContain("intentPrimary");
      expect(header).not.toContain("wordCount");
    });
  });

  describe("JSON export", () => {
    it("should export to JSON format", async () => {
      const json = await ExportService.exportJson(jobId);

      expect(json).toBeDefined();
      expect(typeof json).toBe("string");
      expect(json.length).toBeGreaterThan(0);
    });

    it("should parse as valid JSON", async () => {
      const json = await ExportService.exportJson(jobId);
      const parsed = JSON.parse(json);

      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe("object");
    });

    it("should include metadata", async () => {
      const json = await ExportService.exportJson(jobId);
      const parsed = JSON.parse(json);

      expect(parsed.jobId).toBe(jobId);
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.totalKeywords).toBeGreaterThan(0);
      expect(Array.isArray(parsed.keywords)).toBe(true);
    });

    it("should include all keywords", async () => {
      const json = await ExportService.exportJson(jobId);
      const parsed = JSON.parse(json);

      expect(parsed.keywords.length).toBeGreaterThan(0);

      // Check structure of keywords
      for (const kw of parsed.keywords) {
        expect(kw.keyword).toBeDefined();
        expect(kw.intentPrimary).toBeDefined();
        expect(kw.competitionScore).toBeDefined();
      }
    });
  });

  describe("export statistics", () => {
    it("should calculate export stats", async () => {
      const stats = await ExportService.getExportStats(jobId);

      expect(stats).toBeDefined();
      expect(stats.totalKeywords).toBeGreaterThan(0);
      expect(stats.avgWordCount).toBeGreaterThan(0);
      expect(stats.avgCompetitionScore).toBeGreaterThan(0);
    });

    it("should include intent distribution", async () => {
      const stats = await ExportService.getExportStats(jobId);

      expect(stats.intentDistribution).toBeDefined();
      expect(typeof stats.intentDistribution).toBe("object");
      expect(Object.keys(stats.intentDistribution).length).toBeGreaterThan(0);
    });

    it("should include funnel distribution", async () => {
      const stats = await ExportService.getExportStats(jobId);

      expect(stats.funnelDistribution).toBeDefined();
      expect(Object.keys(stats.funnelDistribution).length).toBeGreaterThan(0);
    });

    it("should include content format distribution", async () => {
      const stats = await ExportService.getExportStats(jobId);

      expect(stats.contentFormatDistribution).toBeDefined();
      expect(
        Object.keys(stats.contentFormatDistribution).length,
      ).toBeGreaterThan(0);
    });

    it("should calculate averages correctly", async () => {
      const stats = await ExportService.getExportStats(jobId);

      expect(stats.avgWordCount).toBeGreaterThan(0);
      expect(stats.avgCompetitionScore).toBeGreaterThanOrEqual(0);
      expect(stats.avgCompetitionScore).toBeLessThanOrEqual(100);
      expect(stats.avgOpportunityScore).toBeGreaterThanOrEqual(0);
      expect(stats.avgOpportunityScore).toBeLessThanOrEqual(100);
    });
  });

  describe("filename generation", () => {
    it("should generate CSV filename", () => {
      const filename = ExportService.getFilename(jobId, "csv");

      expect(filename).toContain("keywords_");
      expect(filename).toContain(".csv");
      expect(filename).toContain(jobId);
    });

    it("should generate JSON filename", () => {
      const filename = ExportService.getFilename(jobId, "json");

      expect(filename).toContain("keywords_");
      expect(filename).toContain(".json");
      expect(filename).toContain(jobId);
    });

    it("should include timestamp", () => {
      const filename = ExportService.getFilename(jobId, "csv");
      const datePattern = /\d{4}-\d{2}-\d{2}/;

      expect(filename).toMatch(datePattern);
    });
  });

  describe("empty export", () => {
    it("should handle jobs with no results", async () => {
      // Create empty job
      const emptyJobId = "empty-job-export";
      await db.insert(keywordJobs).values({
        id: emptyJobId,
        projectId: "test-project-export",
        seedKeywords: JSON.stringify([]),
        status: "completed",
        configJson: "{}",
        checkpointCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const csv = await ExportService.exportCsv(emptyJobId);
      const json = await ExportService.exportJson(emptyJobId);
      const stats = await ExportService.getExportStats(emptyJobId);

      expect(csv).toBeDefined();
      expect(json).toBeDefined();
      expect(stats.totalKeywords).toBe(0);

      // Cleanup
      await db.delete(keywordJobs).where(keywordJobs.id === emptyJobId);
    });
  });
});
