/**
 * P2.2: Auth Middleware Tests
 *
 * Verify x-user-id header authentication
 */

import { Hono } from "hono";
import { requireAuth } from "../../src/middleware/auth";
import type { Context } from "hono";

describe("P2.2: Auth Middleware", () => {
  // Helper to create a test router
  function createTestRouter() {
    const router = new Hono();
    router.use("/*", requireAuth);

    // Test endpoint
    router.post("/test", (c: Context) => {
      const userId = c.get("userId");
      return c.json({
        success: true,
        userId,
      });
    });

    return router;
  }

  it("should reject request without x-user-id header", async () => {
    const router = createTestRouter();

    const response = await router.request(
      new Request("http://localhost/test", { method: "POST" }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error.code).toBe("UNAUTHENTICATED");
  });

  it("should accept request with x-user-id header", async () => {
    const router = createTestRouter();

    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "x-user-id": "test-user-123",
      },
    });

    const response = await router.request(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.userId).toBe("test-user-123");
  });

  it("should set userId in context for downstream handlers", async () => {
    const router = new Hono();
    router.use("/*", requireAuth);

    let capturedUserId: string | undefined;

    router.get("/capture", (c: Context) => {
      capturedUserId = c.get("userId");
      return c.json({ captured: capturedUserId });
    });

    const request = new Request("http://localhost/capture", {
      headers: {
        "x-user-id": "user-456",
      },
    });

    const response = await router.request(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(capturedUserId).toBe("user-456");
    expect(data.captured).toBe("user-456");
  });
});
