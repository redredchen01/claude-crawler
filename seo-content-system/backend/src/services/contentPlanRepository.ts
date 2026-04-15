/**
 * ContentPlanRepository
 * Phase 5-6: Persist and retrieve content generation results with user editing support
 */

import { db } from "../db/index.js";
import { contentPlans } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type {
  AutomatedBrief,
  AutomatedFaq,
  OptimizedInternalLinks,
} from "../services/llmContentAutomationService";

export interface StoredContentPlan {
  brief: AutomatedBrief | null;
  faq: AutomatedFaq | null;
  links: OptimizedInternalLinks | null;
  status: "pending" | "generating" | "completed" | "failed";
  modelVersion: string | null;
  generatedAt: number | null;
  errorMessage?: string | null;
  // Phase 6: User editing and publishing
  isUserEdited?: boolean;
  editedAt?: number | null;
  publishedUrl?: string | null;
  publishedAt?: number | null;
  notes?: string | null;
}

export class ContentPlanRepository {
  /**
   * Get stored content plan for a cluster
   */
  async get(clusterId: string): Promise<StoredContentPlan | null> {
    const result = await db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.clusterId, clusterId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      brief: row.userBriefJson
        ? JSON.parse(row.userBriefJson)
        : row.briefJson
          ? JSON.parse(row.briefJson)
          : null,
      faq: row.userFaqJson
        ? JSON.parse(row.userFaqJson)
        : row.faqJson
          ? JSON.parse(row.faqJson)
          : null,
      links: row.linksJson ? JSON.parse(row.linksJson) : null,
      status:
        (row.status as "pending" | "generating" | "completed" | "failed") ||
        "pending",
      modelVersion: row.modelVersion,
      generatedAt: row.generatedAt,
      errorMessage: row.errorMessage || undefined,
      // Phase 6: User editing and publishing
      isUserEdited: row.isUserEdited || false,
      editedAt: row.editedAt,
      publishedUrl: row.publishedUrl,
      publishedAt: row.publishedAt,
      notes: row.notes,
    };
  }

  /**
   * Get status only (cheaper query)
   */
  async getStatus(
    clusterId: string,
  ): Promise<"pending" | "generating" | "completed" | "failed" | null> {
    const result = await db
      .select({ status: contentPlans.status })
      .from(contentPlans)
      .where(eq(contentPlans.clusterId, clusterId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return (
      (result[0].status as "pending" | "generating" | "completed" | "failed") ||
      "pending"
    );
  }

  /**
   * Upsert content plan with full generation result
   */
  async save(
    clusterId: string,
    result: {
      brief: AutomatedBrief | null;
      faq: AutomatedFaq | null;
      links: OptimizedInternalLinks | null;
      modelVersion: string;
    },
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Check if plan exists
    const existing = await db
      .select({ id: contentPlans.id })
      .from(contentPlans)
      .where(eq(contentPlans.clusterId, clusterId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(contentPlans)
        .set({
          status: "completed",
          briefJson: result.brief ? JSON.stringify(result.brief) : null,
          faqJson: result.faq ? JSON.stringify(result.faq) : null,
          linksJson: result.links ? JSON.stringify(result.links) : null,
          modelVersion: result.modelVersion,
          generatedAt: now,
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(contentPlans.clusterId, clusterId));
    } else {
      // Insert new
      await db.insert(contentPlans).values({
        id: `plan_${clusterId}_${Date.now()}`,
        clusterId,
        status: "completed",
        briefJson: result.brief ? JSON.stringify(result.brief) : null,
        faqJson: result.faq ? JSON.stringify(result.faq) : null,
        linksJson: result.links ? JSON.stringify(result.links) : null,
        modelVersion: result.modelVersion,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * Mark as generating (optimistic lock)
   */
  async markGenerating(clusterId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Check if plan exists
    const existing = await db
      .select({ id: contentPlans.id })
      .from(contentPlans)
      .where(eq(contentPlans.clusterId, clusterId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(contentPlans)
        .set({
          status: "generating",
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(contentPlans.clusterId, clusterId));
    } else {
      // Insert new placeholder
      await db.insert(contentPlans).values({
        id: `plan_${clusterId}_${Date.now()}`,
        clusterId,
        status: "generating",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * Mark as failed
   */
  async markFailed(clusterId: string, error: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Check if plan exists
    const existing = await db
      .select({ id: contentPlans.id })
      .from(contentPlans)
      .where(eq(contentPlans.clusterId, clusterId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(contentPlans)
        .set({
          status: "failed",
          errorMessage: error,
          updatedAt: now,
        })
        .where(eq(contentPlans.clusterId, clusterId));
    } else {
      // Insert new placeholder
      await db.insert(contentPlans).values({
        id: `plan_${clusterId}_${Date.now()}`,
        clusterId,
        status: "failed",
        errorMessage: error,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /**
   * Phase 6: Update user edits (brief, faq, publishing fields)
   * Preserves AI-generated originals (briefJson, faqJson)
   */
  async updateUserEdits(
    clusterId: string,
    edits: {
      brief?: AutomatedBrief | null;
      faq?: AutomatedFaq | null;
      publishedUrl?: string;
      publishedAt?: number;
      notes?: string;
    },
  ): Promise<StoredContentPlan | null> {
    const now = Math.floor(Date.now() / 1000);

    // Build update object
    const updateData: Record<string, any> = {
      isUserEdited: true,
      editedAt: now,
      updatedAt: now,
    };

    if (edits.brief !== undefined) {
      updateData.userBriefJson = edits.brief
        ? JSON.stringify(edits.brief)
        : null;
    }
    if (edits.faq !== undefined) {
      updateData.userFaqJson = edits.faq ? JSON.stringify(edits.faq) : null;
    }
    if (edits.publishedUrl !== undefined) {
      updateData.publishedUrl = edits.publishedUrl;
    }
    if (edits.publishedAt !== undefined) {
      updateData.publishedAt = edits.publishedAt;
    }
    if (edits.notes !== undefined) {
      updateData.notes = edits.notes;
    }

    // Update the plan
    await db
      .update(contentPlans)
      .set(updateData)
      .where(eq(contentPlans.clusterId, clusterId));

    // Return updated plan
    return this.get(clusterId);
  }
}

export const contentPlanRepository = new ContentPlanRepository();
