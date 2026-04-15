import { getDatabase } from "../db/client";
import { jobs, results } from "../db/schema";
import { eq, desc, and, count, inArray } from "drizzle-orm";

export class JobRepository {
  /**
   * Create a new job
   */
  async createJob(data: {
    id: string;
    userId: number;
    seed: string;
    sources: string;
    status: string;
  }) {
    const db = getDatabase();
    const result = await db.insert(jobs).values(data).returning();
    return result[0];
  }

  /**
   * Create multiple jobs in batch
   */
  async createJobBatch(
    jobsData: Array<{
      id: string;
      userId: number;
      seed: string;
      sources: string;
      status: string;
    }>,
  ) {
    if (jobsData.length === 0) return [];

    const db = getDatabase();
    const result = await db.insert(jobs).values(jobsData).returning();
    return result;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(userId: number, limit: number = 50, offset: number = 0) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset);
    return result;
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId: string, status: string, data?: Partial<any>) {
    const db = getDatabase();
    const updateData: any = { status, updatedAt: new Date() };

    if (status === "running" && !data?.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === "completed" || status === "failed") {
      updateData.finishedAt = data?.finishedAt || new Date();
    }

    if (data?.errorMessage) {
      updateData.errorMessage = data.errorMessage;
    }
    if (data?.resultCount !== undefined) {
      updateData.resultCount = data.resultCount;
    }

    const result = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, jobId))
      .returning();
    return result[0];
  }

  /**
   * Get job results
   */
  async getJobResults(jobId: string, limit: number = 25, offset: number = 0) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(results)
      .where(eq(results.jobId, jobId))
      .orderBy(desc(results.score))
      .limit(limit)
      .offset(offset);
    return result;
  }

  /**
   * Add result to job
   */
  async addResult(data: {
    id: string;
    jobId: string;
    normalizedKeyword: string;
    rawKeyword: string;
    source: string;
    intent: string;
    score: number;
    difficulty: number;
    roiScore: number;
  }) {
    const db = getDatabase();
    const result = await db.insert(results).values(data).returning();
    return result[0];
  }

  /**
   * Get total result count for job
   */
  async getResultCount(jobId: string): Promise<number> {
    const db = getDatabase();
    const result = await db
      .select({ count: count() })
      .from(results)
      .where(eq(results.jobId, jobId));
    return result[0]?.count || 0;
  }

  /**
   * Get job results in batch for multiple jobIds
   */
  async getJobResultsBatch(
    jobIds: string[],
  ): Promise<Array<{ jobId: string; count: number }>> {
    if (jobIds.length === 0) return [];

    const db = getDatabase();
    const result = await db
      .select({
        jobId: results.jobId,
        count: count(),
      })
      .from(results)
      .where(inArray(results.jobId, jobIds))
      .groupBy(results.jobId);

    // Create a map for quick lookup
    const countMap = new Map(result.map((r) => [r.jobId, r.count]));

    // Return results in same order as input, with 0 for missing jobs
    return jobIds.map((jobId) => ({
      jobId,
      count: countMap.get(jobId) || 0,
    }));
  }

  /**
   * Delete job and all its results
   */
  async deleteJob(jobId: string) {
    const db = getDatabase();
    // Cascade delete is handled by database constraints
    await db.delete(jobs).where(eq(jobs.id, jobId));
    return true;
  }
}

export const jobRepository = new JobRepository();
