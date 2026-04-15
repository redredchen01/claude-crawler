/**
 * Phase 3 Schema Extension Tests
 *
 * Tests for new fields (topicGroupId, relatedClusterIds, etc.)
 * and new tables (tdk_feedback, tdk_cost_log)
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { db } from "../../src/db/index";
import { initializeDatabase } from "../../src/db/index";
import { contentPlans, tdkFeedback, tdkCostLog } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

describe("Phase 3 Schema Extension", () => {
  const testProjectId = "test-project-p3";
  const testClusterId = randomUUID();

  beforeAll(async () => {
    await initializeDatabase();
  });

  afterEach(async () => {
    // Cleanup test data
    await db
      .delete(contentPlans)
      .where(eq(contentPlans.projectId, testProjectId));
    await db
      .delete(tdkFeedback)
      .where(eq(tdkFeedback.projectId, testProjectId));
    await db.delete(tdkCostLog).where(eq(tdkCostLog.projectId, testProjectId));
  });

  // ====================================================================
  // Test Suite 1: Backward Compatibility
  // ====================================================================

  describe("Backward Compatibility", () => {
    it("should query existing data without new fields", async () => {
      // Insert minimal contentPlan (old format)
      await db.insert(contentPlans).values({
        id: testClusterId,
        projectId: testProjectId,
        clusterId: testClusterId,
        title: "Test Content Plan",
        contentType: "blog",
        createdBy: "test-user",
      });

      // Query
      const plan = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.id, testClusterId))
        .get();

      expect(plan).toBeDefined();
      expect(plan!.id).toBe(testClusterId);
      expect(plan!.topicGroupId).toBeNull();
      expect(plan!.relatedClusterIds).toBeNull();
      expect(plan!.serpDataJson).toBeNull();
      expect(plan!.lastSerpFetchedAt).toBeNull();
    });

    it("should insert new fields without affecting existing columns", async () => {
      const planId = randomUUID();

      await db.insert(contentPlans).values({
        id: planId,
        projectId: testProjectId,
        clusterId: testClusterId,
        title: "Content Plan with New Fields",
        contentType: "faq",
        createdBy: "test-user",
        topicGroupId: "baking-guide",
        relatedClusterIds: JSON.stringify(["cluster-2", "cluster-3"]),
      });

      const plan = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.id, planId))
        .get();

      expect(plan!.topicGroupId).toBe("baking-guide");
      expect(plan!.relatedClusterIds).toBe(
        JSON.stringify(["cluster-2", "cluster-3"]),
      );
      expect(plan!.title).toBe("Content Plan with New Fields");
    });
  });

  // ====================================================================
  // Test Suite 2: New Field Functionality
  // ====================================================================

  describe("New Fields: topicGroupId & relatedClusterIds", () => {
    it("should support JSON array in relatedClusterIds", async () => {
      const planId = randomUUID();
      const relatedIds = ["cluster-a", "cluster-b", "cluster-c"];

      await db.insert(contentPlans).values({
        id: planId,
        projectId: testProjectId,
        clusterId: testClusterId,
        title: "Multi-Page Plan",
        contentType: "blog",
        relatedClusterIds: JSON.stringify(relatedIds),
      });

      const plan = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.id, planId))
        .get();

      const parsed = JSON.parse(plan!.relatedClusterIds!);
      expect(parsed).toEqual(relatedIds);
    });

    it("should query by topicGroupId", async () => {
      const topic = "baking-guide";
      const plan1Id = randomUUID();
      const plan2Id = randomUUID();

      // Insert two plans with same topic, one with different topic
      await db.insert(contentPlans).values({
        id: plan1Id,
        projectId: testProjectId,
        clusterId: randomUUID(),
        title: "Baking Cookies",
        contentType: "blog",
        topicGroupId: topic,
      });

      await db.insert(contentPlans).values({
        id: plan2Id,
        projectId: testProjectId,
        clusterId: randomUUID(),
        title: "Baking Bread",
        contentType: "blog",
        topicGroupId: topic,
      });

      // Query by topic
      const plans = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.topicGroupId, topic))
        .all();

      expect(plans).toHaveLength(2);
      expect(plans.map((p) => p.id)).toContain(plan1Id);
      expect(plans.map((p) => p.id)).toContain(plan2Id);
    });
  });

  // ====================================================================
  // Test Suite 3: SERP Data Fields
  // ====================================================================

  describe("SERP Data Fields", () => {
    it("should store and retrieve SERP snapshot", async () => {
      const planId = randomUUID();
      const serpData = [
        {
          rank: 1,
          title: "Best Cookie Recipe",
          description: "Learn the best techniques",
          url: "example.com/cookies",
          domain: "example.com",
        },
        {
          rank: 2,
          title: "Cookie Baking Guide",
          description: "A comprehensive guide",
          url: "another.com/baking",
          domain: "another.com",
        },
      ];

      await db.insert(contentPlans).values({
        id: planId,
        projectId: testProjectId,
        clusterId: testClusterId,
        title: "Cookie Content Plan",
        contentType: "blog",
        serpDataJson: JSON.stringify(serpData),
        lastSerpFetchedAt: new Date().toISOString(),
      });

      const plan = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.id, planId))
        .get();

      const retrieved = JSON.parse(plan!.serpDataJson!);
      expect(retrieved).toEqual(serpData);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].rank).toBe(1);
    });
  });

  // ====================================================================
  // Test Suite 4: Feedback Table
  // ====================================================================

  describe("TDK Feedback Table", () => {
    it("should insert positive feedback", async () => {
      const feedbackId = randomUUID();
      const contentPlanId = randomUUID();

      await db.insert(tdkFeedback).values({
        id: feedbackId,
        contentPlanId,
        projectId: testProjectId,
        type: "positive",
        feedbackText: "Great TDK suggestion!",
        createdBy: "user-123",
      });

      const feedback = await db
        .select()
        .from(tdkFeedback)
        .where(eq(tdkFeedback.id, feedbackId))
        .get();

      expect(feedback).toBeDefined();
      expect(feedback!.type).toBe("positive");
      expect(feedback!.feedbackText).toBe("Great TDK suggestion!");
    });

    it("should insert negative feedback with optional text", async () => {
      const feedbackId = randomUUID();
      const contentPlanId = randomUUID();

      await db.insert(tdkFeedback).values({
        id: feedbackId,
        contentPlanId,
        projectId: testProjectId,
        type: "negative",
        createdBy: "user-456",
      });

      const feedback = await db
        .select()
        .from(tdkFeedback)
        .where(eq(tdkFeedback.id, feedbackId))
        .get();

      expect(feedback!.type).toBe("negative");
      expect(feedback!.feedbackText).toBeNull();
    });

    it("should query feedback by contentPlanId", async () => {
      const contentPlanId = randomUUID();

      // Insert 3 feedbacks for same plan
      for (let i = 0; i < 3; i++) {
        await db.insert(tdkFeedback).values({
          id: randomUUID(),
          contentPlanId,
          projectId: testProjectId,
          type: i % 2 === 0 ? "positive" : "negative",
        });
      }

      // Query feedbacks
      const feedbacks = await db
        .select()
        .from(tdkFeedback)
        .where(eq(tdkFeedback.contentPlanId, contentPlanId))
        .all();

      expect(feedbacks).toHaveLength(3);
    });

    it("should not delete feedback when contentPlan is deleted", async () => {
      const planId = randomUUID();
      const feedbackId = randomUUID();

      // Insert plan
      await db.insert(contentPlans).values({
        id: planId,
        projectId: testProjectId,
        clusterId: testClusterId,
        title: "Plan to Delete",
        contentType: "blog",
      });

      // Insert feedback for that plan
      await db.insert(tdkFeedback).values({
        id: feedbackId,
        contentPlanId: planId,
        projectId: testProjectId,
        type: "positive",
      });

      // Delete the plan
      await db.delete(contentPlans).where(eq(contentPlans.id, planId));

      // Feedback should still exist
      const feedback = await db
        .select()
        .from(tdkFeedback)
        .where(eq(tdkFeedback.id, feedbackId))
        .get();

      expect(feedback).toBeDefined();
      expect(feedback!.contentPlanId).toBe(planId);
    });
  });

  // ====================================================================
  // Test Suite 5: Cost Log Table
  // ====================================================================

  describe("TDK Cost Log Table", () => {
    it("should insert cost record for generate operation", async () => {
      const costId = randomUUID();

      await db.insert(tdkCostLog).values({
        id: costId,
        projectId: testProjectId,
        userId: "user-123",
        operation: "generate",
        tokensUsed: 1500,
        estimatedCost: 0.022,
      });

      const log = await db
        .select()
        .from(tdkCostLog)
        .where(eq(tdkCostLog.id, costId))
        .get();

      expect(log).toBeDefined();
      expect(log!.operation).toBe("generate");
      expect(log!.tokensUsed).toBe(1500);
      expect(log!.estimatedCost).toBeCloseTo(0.022);
    });

    it("should query cost logs by projectId", async () => {
      const costIds = [randomUUID(), randomUUID(), randomUUID()];

      for (const costId of costIds) {
        await db.insert(tdkCostLog).values({
          id: costId,
          projectId: testProjectId,
          operation: "generate",
          tokensUsed: 1000 + Math.random() * 1000,
          estimatedCost: 0.015,
        });
      }

      // Query by project
      const logs = await db
        .select()
        .from(tdkCostLog)
        .where(eq(tdkCostLog.projectId, testProjectId))
        .all();

      expect(logs).toHaveLength(3);
      expect(logs.every((l) => l.projectId === testProjectId)).toBe(true);
    });

    it("should support different operation types", async () => {
      const ops = ["generate", "serp_fetch", "analyze"];

      for (const op of ops) {
        await db.insert(tdkCostLog).values({
          id: randomUUID(),
          projectId: testProjectId,
          operation: op,
          tokensUsed: 100,
        });
      }

      const logs = await db
        .select()
        .from(tdkCostLog)
        .where(eq(tdkCostLog.projectId, testProjectId))
        .all();

      const operations = logs.map((l) => l.operation);
      expect(operations).toContain("generate");
      expect(operations).toContain("serp_fetch");
      expect(operations).toContain("analyze");
    });
  });

  // ====================================================================
  // Test Suite 6: Index Performance
  // ====================================================================

  describe("Index Performance", () => {
    it("should query by topicGroupId efficiently", async () => {
      const topic = "test-topic";
      const startTime = Date.now();

      // Insert 100 plans with same topic
      for (let i = 0; i < 100; i++) {
        await db.insert(contentPlans).values({
          id: randomUUID(),
          projectId: testProjectId,
          clusterId: randomUUID(),
          title: `Plan ${i}`,
          contentType: "blog",
          topicGroupId: topic,
        });
      }

      // Query by topic
      const queryStart = Date.now();
      const plans = await db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.topicGroupId, topic))
        .all();
      const queryTime = Date.now() - queryStart;

      expect(plans.length).toBe(100);
      expect(queryTime).toBeLessThan(200); // Should be fast with index
    });
  });
});
