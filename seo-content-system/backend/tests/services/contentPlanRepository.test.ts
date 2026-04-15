/**
 * ContentPlanRepository Tests
 * Phase 5: Persistence layer for content generation results
 */

import { db } from "../../src/db";
import { contentPlans } from "../../src/db/schema";
import { contentPlanRepository } from "../../src/services/contentPlanRepository";

describe("ContentPlanRepository", () => {
  const testClusterId = "test-cluster-1";

  beforeEach(async () => {
    // Clean up before each test
    await db.delete(contentPlans).run();
  });

  test("should return null for cluster without plan", async () => {
    const plan = await contentPlanRepository.get(testClusterId);
    expect(plan).toBeNull();
  });

  test("should save and retrieve plan with all fields", async () => {
    const briefData = {
      title: "Test Title",
      metaDescription: "Test meta",
      contentLength: { target: 2000, min: 1500, max: 2500 },
      targetKeywords: { primary: ["keyword1"], secondary: ["keyword2"] },
    };

    const faqData = {
      clusterId: testClusterId,
      pillarKeyword: "test",
      pageTitle: "FAQ",
      introduction: "Intro",
      faqs: [{ question: "Q1", answer: "A1" }],
    };

    const linksData = {
      clusterId: testClusterId,
      pillarKeyword: "test",
      outgoingLinks: [{ anchorText: "link1", relevanceScore: 0.9 }],
      incomingLinks: [],
    };

    await contentPlanRepository.save(testClusterId, {
      brief: briefData as any,
      faq: faqData as any,
      links: linksData as any,
      modelVersion: "claude-3-5-sonnet-20241022",
    });

    const plan = await contentPlanRepository.get(testClusterId);
    expect(plan).toBeDefined();
    expect(plan?.status).toBe("completed");
    expect(plan?.brief).toEqual(briefData);
    expect(plan?.faq).toEqual(faqData);
    expect(plan?.links).toEqual(linksData);
    expect(plan?.modelVersion).toBe("claude-3-5-sonnet-20241022");
    expect(plan?.generatedAt).toBeDefined();
  });

  test("should mark generating status", async () => {
    await contentPlanRepository.markGenerating(testClusterId);

    const status = await contentPlanRepository.getStatus(testClusterId);
    expect(status).toBe("generating");
  });

  test("should mark failed with error message", async () => {
    const errorMsg = "API rate limit exceeded";
    await contentPlanRepository.markFailed(testClusterId, errorMsg);

    const plan = await contentPlanRepository.get(testClusterId);
    expect(plan?.status).toBe("failed");
    expect(plan?.errorMessage).toBe(errorMsg);
  });

  test("should upsert on second save (no duplicates)", async () => {
    const brief1 = { title: "Title 1" } as any;
    const brief2 = { title: "Title 2" } as any;

    await contentPlanRepository.save(testClusterId, {
      brief: brief1,
      faq: null,
      links: null,
      modelVersion: "v1",
    });

    await contentPlanRepository.save(testClusterId, {
      brief: brief2,
      faq: null,
      links: null,
      modelVersion: "v2",
    });

    const plan = await contentPlanRepository.get(testClusterId);
    expect(plan?.brief).toEqual(brief2);
    expect(plan?.modelVersion).toBe("v2");

    const allPlans = await db.select().from(contentPlans).run();
    const clusterPlans = allPlans.filter((p) => p.clusterId === testClusterId);
    expect(clusterPlans.length).toBe(1);
  });

  test("should handle null values in content fields", async () => {
    await contentPlanRepository.save(testClusterId, {
      brief: null,
      faq: null,
      links: null,
      modelVersion: "v1",
    });

    const plan = await contentPlanRepository.get(testClusterId);
    expect(plan?.status).toBe("completed");
    expect(plan?.brief).toBeNull();
    expect(plan?.faq).toBeNull();
    expect(plan?.links).toBeNull();
  });

  // Phase 6: User editing tests
  test("should update user edits with isUserEdited flag and editedAt timestamp", async () => {
    // First create a plan
    const briefData = { title: "Original Title" } as any;
    await contentPlanRepository.save(testClusterId, {
      brief: briefData,
      faq: null,
      links: null,
      modelVersion: "v1",
    });

    // Update with user edits
    const editedBrief = { title: "Updated Title" } as any;
    const updatedPlan = await contentPlanRepository.updateUserEdits(
      testClusterId,
      { brief: editedBrief },
    );

    expect(updatedPlan).toBeDefined();
    expect(updatedPlan?.isUserEdited).toBe(true);
    expect(updatedPlan?.editedAt).toBeDefined();
    expect(updatedPlan?.brief).toEqual(editedBrief);
  });

  test("should update userBriefJson without touching original briefJson", async () => {
    // Create a plan
    const briefData = { title: "Original Title" } as any;
    await contentPlanRepository.save(testClusterId, {
      brief: briefData,
      faq: null,
      links: null,
      modelVersion: "v1",
    });

    // Get the original DB row to verify briefJson is unchanged
    let dbRow = await db
      .select()
      .from(contentPlans)
      .where((t: any) => t.clusterId === testClusterId)
      .limit(1);

    const originalBriefJson = dbRow[0]?.briefJson;

    // Update with user edits
    const editedBrief = { title: "User Edited Title" } as any;
    await contentPlanRepository.updateUserEdits(testClusterId, {
      brief: editedBrief,
    });

    // Verify: userBriefJson is set, briefJson unchanged
    dbRow = await db
      .select()
      .from(contentPlans)
      .where((t: any) => t.clusterId === testClusterId)
      .limit(1);

    expect(dbRow[0]?.userBriefJson).toBeDefined();
    expect(JSON.parse(dbRow[0]?.userBriefJson)).toEqual(editedBrief);
    expect(dbRow[0]?.briefJson).toBe(originalBriefJson);
  });

  test("should update publishing fields (publishedUrl, publishedAt)", async () => {
    // Create a plan
    await contentPlanRepository.save(testClusterId, {
      brief: {} as any,
      faq: null,
      links: null,
      modelVersion: "v1",
    });

    // Update with publishing info
    const publishedAt = Math.floor(Date.now() / 1000);
    const updatedPlan = await contentPlanRepository.updateUserEdits(
      testClusterId,
      {
        publishedUrl: "https://example.com/article",
        publishedAt,
      },
    );

    expect(updatedPlan?.publishedUrl).toBe("https://example.com/article");
    expect(updatedPlan?.publishedAt).toBe(publishedAt);
  });

  test("should return isUserEdited true and correct fields after user edit", async () => {
    // Create a plan
    const briefData = { title: "Original" } as any;
    const faqData = {
      faqs: [{ question: "Q1", answer: "A1" }],
    } as any;

    await contentPlanRepository.save(testClusterId, {
      brief: briefData,
      faq: faqData,
      links: null,
      modelVersion: "v1",
    });

    // Update with multiple fields
    const editedBrief = { title: "Edited" } as any;
    const editedFaq = {
      faqs: [{ question: "Q1 Edited", answer: "A1 Edited" }],
    } as any;

    const updatedPlan = await contentPlanRepository.updateUserEdits(
      testClusterId,
      {
        brief: editedBrief,
        faq: editedFaq,
        notes: "User notes about this plan",
      },
    );

    expect(updatedPlan?.isUserEdited).toBe(true);
    expect(updatedPlan?.editedAt).toBeDefined();
    expect(updatedPlan?.brief).toEqual(editedBrief);
    expect(updatedPlan?.faq).toEqual(editedFaq);
    expect(updatedPlan?.notes).toBe("User notes about this plan");
  });
});
