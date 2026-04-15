/**
 * Export API Routes
 * Phase 4.1: Export clusters and keywords to CSV/JSON
 */

import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  keywordClusters,
  clusterMembers,
  keywordCandidates,
  keywordFeatures,
} from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = new Hono();

/**
 * GET /api/export/clusters/:jobId?format=csv|json
 * Export clusters for a job
 */
router.get("/clusters/:jobId", async (c) => {
  try {
    const jobId = c.req.param("jobId");
    const format = (c.req.query("format") || "json") as "csv" | "json";

    // Get clusters
    const clusters = await db
      .select()
      .from(keywordClusters)
      .where(eq(keywordClusters.jobId, jobId));

    if (clusters.length === 0) {
      return c.json({ error: "No clusters found" }, 404);
    }

    if (format === "csv") {
      return exportClustersCSV(c, clusters);
    }

    // JSON format
    const clusterData = await Promise.all(
      clusters.map(async (cluster) => {
        // Get member keywords for this cluster
        const members = await db
          .select()
          .from(clusterMembers)
          .where(eq(clusterMembers.cluster_id, cluster.id));

        const keywords = members.map((m) => m.keyword_id);

        return {
          id: cluster.id,
          name: cluster.cluster_name,
          pillarKeyword: cluster.pillar_keyword,
          pageType: cluster.page_type,
          priority: cluster.priority_score,
          competition: cluster.avg_competition,
          keywords,
          memberCount: keywords.length,
        };
      }),
    );

    c.header("Content-Type", "application/json");
    c.header(
      "Content-Disposition",
      `attachment; filename="clusters_${jobId}.json"`,
    );

    return c.body(JSON.stringify(clusterData, null, 2));
  } catch (error) {
    console.error("Failed to export clusters:", error);
    return c.json({ error: "Failed to export clusters" }, 500);
  }
});

/**
 * GET /api/export/keywords/:jobId?format=csv|json
 * Export keywords for a job
 */
router.get("/keywords/:jobId", async (c) => {
  try {
    const jobId = c.req.param("jobId");
    const format = (c.req.query("format") || "json") as "csv" | "json";

    // Get keywords for this job
    const keywords = await db
      .select()
      .from(keywordCandidates)
      .where(eq(keywordCandidates.job_id, jobId));

    if (keywords.length === 0) {
      return c.json({ error: "No keywords found" }, 404);
    }

    // Get features for all keywords
    const keywordIds = keywords.map((k) => k.id);
    let features = [] as any[];

    if (keywordIds.length > 0) {
      features = await db
        .select()
        .from(keywordFeatures)
        .where(eq(keywordFeatures.keyword_id, keywordIds[0])); // Simplified for now
    }

    if (format === "csv") {
      return exportKeywordsCSV(c, keywords, features);
    }

    // JSON format
    const keywordData = keywords.map((kw, idx) => ({
      rawKeyword: kw.raw_keyword,
      normalizedKeyword: kw.normalized_keyword,
      source: kw.source_type,
      sourceEngine: kw.source_engine,
      depth: kw.depth,
      features: features[idx] || {},
    }));

    c.header("Content-Type", "application/json");
    c.header(
      "Content-Disposition",
      `attachment; filename="keywords_${jobId}.json"`,
    );

    return c.body(JSON.stringify(keywordData, null, 2));
  } catch (error) {
    console.error("Failed to export keywords:", error);
    return c.json({ error: "Failed to export keywords" }, 500);
  }
});

/**
 * Helper: Export clusters to CSV
 */
function exportClustersCSV(c: any, clusters: any[]) {
  const csv = [
    "Cluster ID,Cluster Name,Pillar Keyword,Page Type,Priority,Competition,Member Count",
    ...clusters.map(
      (cluster) =>
        `"${cluster.id}","${cluster.cluster_name}","${cluster.pillar_keyword}","${cluster.page_type}",${cluster.priority_score || 0},${cluster.avg_competition || 0},${cluster.keywords_count || 0}`,
    ),
  ].join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="clusters_${new Date().toISOString().split("T")[0]}.csv"`,
  );

  return c.body(csv);
}

/**
 * Helper: Export keywords to CSV
 */
function exportKeywordsCSV(c: any, keywords: any[], features: any[]) {
  const csv = [
    "Keyword,Normalized,Source,Engine,Depth,Intent Primary,Intent Secondary,Funnel Stage,Content Format",
    ...keywords.map((kw, idx) => {
      const feature = features[idx] || {};
      return `"${kw.raw_keyword}","${kw.normalized_keyword || ""}","${kw.source_type}","${kw.source_engine}",${kw.depth || 0},"${feature.intent_primary || ""}","${feature.intent_secondary || ""}","${feature.funnel_stage || ""}","${feature.content_format || ""}"`;
    }),
  ].join("\n");

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="keywords_${new Date().toISOString().split("T")[0]}.csv"`,
  );

  return c.body(csv);
}

export default router;
