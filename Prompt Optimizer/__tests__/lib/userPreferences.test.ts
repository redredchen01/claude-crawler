import { prisma } from "@/lib/db";
import {
  getUserPreferences,
  updateUserPreferences,
  updateEmailNotifications,
  updatePrivacySettings,
  updateDefaultBatchSettings,
  resetUserPreferences,
} from "@/lib/userPreferences";

describe("User Preferences Service", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `prefs-test-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.userPreference.deleteMany({
      where: { userId: testUserId },
    });
  });

  describe("getUserPreferences", () => {
    test("should create and return default preferences for new user", async () => {
      const prefs = await getUserPreferences(testUserId);

      expect(prefs).toHaveProperty("userId");
      expect(prefs.userId).toBe(testUserId);
      expect(prefs.language).toBe("en");
      expect(prefs.timezone).toBe("UTC");
      expect(prefs.theme).toBe("system");
    });

    test("should return default email notification settings", async () => {
      const prefs = await getUserPreferences(testUserId);

      expect(prefs.emailNotifications).toHaveProperty("batchCompleted");
      expect(prefs.emailNotifications).toHaveProperty("batchFailed");
      expect(prefs.emailNotifications).toHaveProperty("weeklyReport");
      expect(prefs.emailNotifications).toHaveProperty("monthlyReport");
    });

    test("should return default privacy settings", async () => {
      const prefs = await getUserPreferences(testUserId);

      expect(prefs.privacySettings).toHaveProperty("shareAnalytics");
      expect(prefs.privacySettings).toHaveProperty("allowDataExport");
    });

    test("should return default batch settings", async () => {
      const prefs = await getUserPreferences(testUserId);

      expect(prefs.defaultBatchSettings).toHaveProperty("defaultEndpoint");
      expect(prefs.defaultBatchSettings).toHaveProperty("autoProcess");
      expect(prefs.defaultBatchSettings).toHaveProperty("notifyOnCompletion");
    });

    test("should return same preferences on repeated calls", async () => {
      const prefs1 = await getUserPreferences(testUserId);
      const prefs2 = await getUserPreferences(testUserId);

      expect(prefs1.userId).toBe(prefs2.userId);
      expect(prefs1.language).toBe(prefs2.language);
    });
  });

  describe("updateUserPreferences", () => {
    test("should update language preference", async () => {
      const updated = await updateUserPreferences(testUserId, {
        language: "es",
      });

      expect(updated.language).toBe("es");
    });

    test("should update timezone", async () => {
      const updated = await updateUserPreferences(testUserId, {
        timezone: "America/New_York",
      });

      expect(updated.timezone).toBe("America/New_York");
    });

    test("should update theme", async () => {
      const updated = await updateUserPreferences(testUserId, {
        theme: "dark",
      });

      expect(updated.theme).toBe("dark");
    });

    test("should update multiple preferences at once", async () => {
      const updated = await updateUserPreferences(testUserId, {
        language: "fr",
        timezone: "Europe/Paris",
        theme: "light",
      });

      expect(updated.language).toBe("fr");
      expect(updated.timezone).toBe("Europe/Paris");
      expect(updated.theme).toBe("light");
    });
  });

  describe("updateEmailNotifications", () => {
    test("should update email notification settings", async () => {
      const updated = await updateEmailNotifications(testUserId, {
        batchCompleted: false,
        weeklyReport: true,
      });

      expect(updated.batchCompleted).toBe(false);
      expect(updated.weeklyReport).toBe(true);
    });

    test("should preserve other notification settings", async () => {
      const updated = await updateEmailNotifications(testUserId, {
        monthlyReport: false,
      });

      expect(updated.monthlyReport).toBe(false);
      expect(updated).toHaveProperty("batchFailed");
    });
  });

  describe("updatePrivacySettings", () => {
    test("should update privacy settings", async () => {
      const updated = await updatePrivacySettings(testUserId, {
        shareAnalytics: true,
      });

      expect(updated.shareAnalytics).toBe(true);
    });

    test("should preserve other privacy settings", async () => {
      const updated = await updatePrivacySettings(testUserId, {
        allowDataExport: false,
      });

      expect(updated.allowDataExport).toBe(false);
      expect(updated).toHaveProperty("shareAnalytics");
    });
  });

  describe("updateDefaultBatchSettings", () => {
    test("should update batch endpoint", async () => {
      const updated = await updateDefaultBatchSettings(testUserId, {
        defaultEndpoint: "score",
      });

      expect(updated.defaultEndpoint).toBe("score");
    });

    test("should update auto process setting", async () => {
      const updated = await updateDefaultBatchSettings(testUserId, {
        autoProcess: true,
      });

      expect(updated.autoProcess).toBe(true);
    });

    test("should update notification setting", async () => {
      const updated = await updateDefaultBatchSettings(testUserId, {
        notifyOnCompletion: false,
      });

      expect(updated.notifyOnCompletion).toBe(false);
    });
  });

  describe("resetUserPreferences", () => {
    test("should reset preferences to defaults", async () => {
      // First change some settings
      await updateUserPreferences(testUserId, {
        language: "de",
        timezone: "Europe/Berlin",
      });

      // Then reset
      await resetUserPreferences(testUserId);

      const prefs = await getUserPreferences(testUserId);

      expect(prefs.language).toBe("en");
      expect(prefs.timezone).toBe("UTC");
    });

    test("should reset email notifications to defaults", async () => {
      // Change settings
      await updateEmailNotifications(testUserId, {
        batchCompleted: false,
        weeklyReport: true,
      });

      // Reset
      await resetUserPreferences(testUserId);

      const prefs = await getUserPreferences(testUserId);

      expect(prefs.emailNotifications.batchCompleted).toBe(true);
      expect(prefs.emailNotifications.weeklyReport).toBe(false);
    });

    test("should reset batch settings to defaults", async () => {
      // Change settings
      await updateDefaultBatchSettings(testUserId, {
        defaultEndpoint: "score",
        autoProcess: true,
      });

      // Reset
      await resetUserPreferences(testUserId);

      const prefs = await getUserPreferences(testUserId);

      expect(prefs.defaultBatchSettings.defaultEndpoint).toBe("optimize-full");
      expect(prefs.defaultBatchSettings.autoProcess).toBe(false);
    });
  });
});
