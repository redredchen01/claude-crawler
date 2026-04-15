/**
 * P2.1: TDK DB Integration Tests
 *
 * Test database operations for generate, save, and retrieve
 */

import { db, initializeDatabase } from "../../src/db";
import { contentPlans } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createTdkRouter } from "../../src/api/tdk";
import { MockTdkGeneratorService, MockTdkValidatorService } from "./mocks";

describe("P2.1: TDK DB Integration", () => {
  const testProjectId = "test-project-123";
  const testClusterId = "test-cluster-456";
  const testUserId = "test-user-789";

  let router: ReturnType<typeof createTdkRouter>;

  beforeAll(async () => {
    await initializeDatabase();
    // Use mock services to avoid API calls in tests
    const mockGenerator = new MockTdkGeneratorService();
    const mockValidator = new MockTdkValidatorService();
    router = createTdkRouter(mockGenerator, mockValidator);
  });

  beforeEach(async () => {
    // Create test content plan
    await db.insert(contentPlans).values({
      id: testClusterId,
      projectId: testProjectId,
      clusterId: testClusterId,
      title: "Test Content Plan",
      contentType: "blog",
      createdBy: testUserId,
    });
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(contentPlans).where(eq(contentPlans.id, testClusterId));
  });

  it("should generate TDK and save to database", async () => {
    const request = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "How to bake cookies",
          keywords: ["chocolate chip", "recipe"],
          contentSnippet: "Learn the best techniques for perfect cookies",
          language: "en",
        }),
      },
    );

    const response = await router.request(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.primary.candidate.title).toBeDefined();

    // Verify data was saved to database
    const saved = await db
      .select({
        tdkJson: contentPlans.tdkJson,
        tdkGeneratedAt: contentPlans.tdkGeneratedAt,
        tdkGenerationCount: contentPlans.tdkGenerationCount,
        updatedBy: contentPlans.updatedBy,
      })
      .from(contentPlans)
      .where(eq(contentPlans.id, testClusterId))
      .get();

    expect(saved).toBeDefined();
    expect(saved?.tdkJson).toBeDefined();
    expect(saved?.tdkGeneratedAt).toBeDefined();
    expect(saved?.tdkGenerationCount).toBe(1);
    expect(saved?.updatedBy).toBe(testUserId);

    const tdkJson = JSON.parse(saved?.tdkJson || "{}");
    expect(tdkJson.primary).toBeDefined();
    expect(tdkJson.metadata.generatedAt).toBeDefined();
  });

  it("should return 404 for non-existent cluster", async () => {
    const request = new Request(
      `http://localhost/projects/${testProjectId}/clusters/non-existent/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Test",
          keywords: [],
          language: "en",
        }),
      },
    );

    const response = await router.request(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("should save user-edited TDK", async () => {
    const request = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk-save`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userTdkJson: {
            title: "Custom Title",
            description: "User edited description",
            keywords: ["custom", "keywords"],
          },
        }),
      },
    );

    const response = await router.request(request);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify data was saved to database
    const saved = await db
      .select({ userTdkJson: contentPlans.userTdkJson })
      .from(contentPlans)
      .where(eq(contentPlans.id, testClusterId))
      .get();

    expect(saved).toBeDefined();
    const userTdk = JSON.parse(saved?.userTdkJson || "{}");
    expect(userTdk.title).toBe("Custom Title");
    expect(userTdk.editedAt).toBeDefined();
  });

  it("should retrieve TDK from database", async () => {
    // First, generate TDK
    const generateRequest = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Test topic",
          keywords: ["test"],
          language: "en",
        }),
      },
    );

    await router.request(generateRequest);

    // Then retrieve it
    const getRequest = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk`,
      {
        headers: {
          "x-user-id": testUserId,
        },
      },
    );

    const response = await router.request(getRequest);
    const data = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.tdkJson).toBeDefined();
    expect(data.data.tdkJson.primary).toBeDefined();
    expect(data.data.tdkGeneratedAt).toBeDefined();
    expect(data.data.tdkGenerationCount).toBe(1);
  });

  it("should increment generation count on regeneration", async () => {
    // Generate once
    const firstRequest = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Test",
          keywords: [],
          language: "en",
        }),
      },
    );

    await router.request(firstRequest);

    // Generate again
    const secondRequest = new Request(
      `http://localhost/projects/${testProjectId}/clusters/${testClusterId}/tdk-optimize`,
      {
        method: "POST",
        headers: {
          "x-user-id": testUserId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topic: "Different topic",
          keywords: ["different"],
          language: "zh",
        }),
      },
    );

    await router.request(secondRequest);

    // Verify count is 2
    const saved = await db
      .select({ tdkGenerationCount: contentPlans.tdkGenerationCount })
      .from(contentPlans)
      .where(eq(contentPlans.id, testClusterId))
      .get();

    expect(saved?.tdkGenerationCount).toBe(2);
  });
});
