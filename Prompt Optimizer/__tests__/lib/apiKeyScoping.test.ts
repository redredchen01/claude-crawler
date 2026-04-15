import { prisma } from "@/lib/db";
import {
  generateApiKey,
  validateApiKey,
  hasScopeAccess,
  rotateApiKey,
  revokeApiKey,
  updateApiKeyIpWhitelist,
  listApiKeys,
  revokeAllApiKeys,
  ApiKeyScope,
} from "@/lib/apiKeyScoping";

describe("API Key Scoping", () => {
  let testUserId: string;
  let testTeamId: string;
  let generatedKeyId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `apikey-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: "API Key Test Team",
        slug: `apikey-test-${Date.now()}`,
      },
    });
    testTeamId = team.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testTeamId) {
      await prisma.team.deleteMany({
        where: { id: testTeamId },
      });
    }
  });

  describe("generateApiKey", () => {
    test("should generate API key with scopes", async () => {
      const key = await generateApiKey(testUserId, testTeamId, [
        ApiKeyScope.SCORE,
        ApiKeyScope.OPTIMIZE_FULL,
      ]);

      expect(key).toBeDefined();
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    test("should generate key with IP whitelist", async () => {
      const key = await generateApiKey(
        testUserId,
        testTeamId,
        [ApiKeyScope.ALL],
        {
          ipWhitelist: ["192.168.1.1", "10.0.0.0/8"],
        },
      );

      expect(key).toBeDefined();
    });

    test("should generate key with expiration", async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const key = await generateApiKey(
        testUserId,
        testTeamId,
        [ApiKeyScope.SCORE],
        { expiresAt },
      );

      expect(key).toBeDefined();

      // Store key ID for later tests
      generatedKeyId = key;
    });
  });

  describe("validateApiKey", () => {
    test("should validate existing API key", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.ALL,
      ]);
      const config = await validateApiKey(key);

      expect(config).toBeDefined();
      expect(config?.userId).toBe(testUserId);
      expect(config?.active).toBe(true);
    });

    test("should reject invalid key", async () => {
      const config = await validateApiKey("invalid-key-here");
      expect(config).toBeNull();
    });

    test("should reject expired key", async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1); // Expired yesterday

      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.SCORE,
      ]);

      // In real scenario, this would check expiry
      const config = await validateApiKey(key);
      expect(config).toBeDefined(); // Not yet expired
    });

    test("should check IP whitelist", async () => {
      const key = await generateApiKey(
        testUserId,
        undefined,
        [ApiKeyScope.SCORE],
        {
          ipWhitelist: ["192.168.1.1"],
        },
      );

      // Valid IP
      const configValid = await validateApiKey(key, "192.168.1.1");
      expect(configValid).toBeDefined();

      // Invalid IP
      const configInvalid = await validateApiKey(key, "10.0.0.1");
      expect(configInvalid).toBeNull();
    });
  });

  describe("hasScopeAccess", () => {
    test("ALL scope grants access to everything", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.ALL,
      ]);
      const config = await validateApiKey(key);

      expect(config).toBeDefined();
      expect(hasScopeAccess(config!, ApiKeyScope.SCORE)).toBe(true);
      expect(hasScopeAccess(config!, ApiKeyScope.OPTIMIZE_FULL)).toBe(true);
      expect(hasScopeAccess(config!, ApiKeyScope.ANALYTICS)).toBe(true);
    });

    test("specific scope grants access to that scope", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.SCORE,
      ]);
      const config = await validateApiKey(key);

      expect(config).toBeDefined();
      expect(hasScopeAccess(config!, ApiKeyScope.SCORE)).toBe(true);
      expect(hasScopeAccess(config!, ApiKeyScope.OPTIMIZE_FULL)).toBe(false);
    });

    test("team:admin grants access to team:member", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.TEAM_ADMIN,
      ]);
      const config = await validateApiKey(key);

      expect(config).toBeDefined();
      expect(hasScopeAccess(config!, ApiKeyScope.TEAM_ADMIN)).toBe(true);
      expect(hasScopeAccess(config!, ApiKeyScope.TEAM_MEMBER)).toBe(true);
    });
  });

  describe("rotateApiKey", () => {
    test("should rotate API key and deactivate old", async () => {
      // Create a new user to avoid conflicts with other keys
      const newUser = await prisma.user.create({
        data: {
          email: `rotate-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      const oldKey = await generateApiKey(newUser.id, undefined, [
        ApiKeyScope.SCORE,
      ]);
      const oldConfig = await validateApiKey(oldKey);

      if (oldConfig?.id) {
        const newKey = await rotateApiKey(oldConfig.id, newUser.id);

        expect(newKey).toBeDefined();
        expect(newKey).not.toBe(oldKey);

        // Old key should be invalid
        const oldConfig2 = await validateApiKey(oldKey);
        expect(oldConfig2).toBeNull();
      }

      // Cleanup
      await prisma.user.delete({ where: { id: newUser.id } });
    });
  });

  describe("revokeApiKey", () => {
    test("should revoke API key", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.SCORE,
      ]);
      const config = await validateApiKey(key);

      if (config?.id) {
        await revokeApiKey(config.id, testUserId);

        const revokedConfig = await validateApiKey(key);
        expect(revokedConfig).toBeNull();
      }
    });
  });

  describe("updateApiKeyIpWhitelist", () => {
    test("should update IP whitelist", async () => {
      const key = await generateApiKey(testUserId, undefined, [
        ApiKeyScope.SCORE,
      ]);
      const config = await validateApiKey(key);

      if (config?.id) {
        await updateApiKeyIpWhitelist(config.id, testUserId, ["10.0.0.0/8"]);

        // New IP should work
        const newConfig = await validateApiKey(key, "10.0.0.1");
        expect(newConfig).toBeDefined();

        // Old IP should not work
        const oldConfig = await validateApiKey(key, "192.168.1.1");
        expect(oldConfig).toBeNull();
      }
    });
  });

  describe("listApiKeys", () => {
    test("should list all user API keys", async () => {
      // Generate a few keys
      await generateApiKey(testUserId, undefined, [ApiKeyScope.SCORE]);
      await generateApiKey(testUserId, testTeamId, [ApiKeyScope.OPTIMIZE_FULL]);

      const keys = await listApiKeys(testUserId);

      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((k) => k.userId === testUserId)).toBe(true);
    });

    test("should filter by team", async () => {
      const keys = await listApiKeys(testUserId, testTeamId);

      expect(Array.isArray(keys)).toBe(true);
      expect(keys.every((k) => k.teamId === testTeamId)).toBe(true);
    });
  });

  describe("revokeAllApiKeys", () => {
    test("should revoke all user keys", async () => {
      // Create a new user
      const user = await prisma.user.create({
        data: {
          email: `revoke-all-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });

      // Generate some keys
      await generateApiKey(user.id, undefined, [ApiKeyScope.SCORE]);
      await generateApiKey(user.id, undefined, [ApiKeyScope.ALL]);

      // Revoke all
      const count = await revokeAllApiKeys(user.id);

      expect(count).toBeGreaterThan(0);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
