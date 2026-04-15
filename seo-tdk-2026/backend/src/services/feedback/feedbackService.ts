/**
 * Feedback Service
 *
 * Handles user feedback collection and analytics on generated TDKs
 */

import { db } from "../../db";
import { tdkFeedback } from "../../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface FeedbackInput {
  contentPlanId: string;
  projectId: string;
  type: "positive" | "negative";
  feedbackText?: string;
  serpSnapshot?: Record<string, any>;
  createdBy?: string;
  createdAt: string;
}

export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
}

/**
 * Feedback Service
 *
 * Handles recording and retrieving user feedback on TDK generation
 */
export class FeedbackService {
  /**
   * Record user feedback
   *
   * @param feedback - Feedback input data
   * @returns Generated feedback ID
   */
  static async record(feedback: FeedbackInput): Promise<string> {
    const id = randomUUID();

    await db.insert(tdkFeedback).values({
      id,
      contentPlanId: feedback.contentPlanId,
      projectId: feedback.projectId,
      type: feedback.type,
      feedbackText: feedback.feedbackText,
      serpSnapshotJson: feedback.serpSnapshot
        ? JSON.stringify(feedback.serpSnapshot)
        : null,
      createdAt: feedback.createdAt,
      createdBy: feedback.createdBy,
    });

    return id;
  }

  /**
   * Get feedback statistics for a project
   *
   * @param projectId - Project ID
   * @returns Feedback statistics
   */
  static async getProjectStats(projectId: string): Promise<FeedbackStats> {
    const feedbacks = await db
      .select({ type: tdkFeedback.type })
      .from(tdkFeedback)
      .where(eq(tdkFeedback.projectId, projectId));

    const total = feedbacks.length;
    const positive = feedbacks.filter((f) => f.type === "positive").length;
    const negative = feedbacks.filter((f) => f.type === "negative").length;

    return {
      total,
      positive,
      negative,
      positiveRate: total > 0 ? positive / total : 0,
    };
  }

  /**
   * Get feedback for a specific content plan
   *
   * @param contentPlanId - Content plan ID
   * @returns Array of feedback records
   */
  static async getContentPlanFeedback(contentPlanId: string) {
    return await db
      .select()
      .from(tdkFeedback)
      .where(eq(tdkFeedback.contentPlanId, contentPlanId));
  }

  /**
   * Delete feedback (for testing or admin purposes)
   *
   * @param feedbackId - Feedback ID
   */
  static async delete(feedbackId: string): Promise<void> {
    await db.delete(tdkFeedback).where(eq(tdkFeedback.id, feedbackId));
  }
}
