import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export interface UserPreferences {
  userId: string;
  language: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  emailNotifications: {
    batchCompleted: boolean;
    batchFailed: boolean;
    weeklyReport: boolean;
    monthlyReport: boolean;
  };
  privacySettings: {
    shareAnalytics: boolean;
    allowDataExport: boolean;
  };
  defaultBatchSettings: {
    defaultEndpoint: "optimize-full" | "score";
    autoProcess: boolean;
    notifyOnCompletion: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get or create user preferences
 */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  try {
    let prefs = await prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userPreference.create({
        data: {
          userId,
          language: "en",
          timezone: "UTC",
          theme: "system",
          emailNotifications: JSON.stringify({
            batchCompleted: true,
            batchFailed: true,
            weeklyReport: false,
            monthlyReport: true,
          }),
          privacySettings: JSON.stringify({
            shareAnalytics: false,
            allowDataExport: true,
          }),
          defaultBatchSettings: JSON.stringify({
            defaultEndpoint: "optimize-full",
            autoProcess: false,
            notifyOnCompletion: true,
          }),
        },
      });
    }

    return {
      userId: prefs.userId,
      language: prefs.language,
      timezone: prefs.timezone,
      theme: prefs.theme as "light" | "dark" | "system",
      emailNotifications: JSON.parse(prefs.emailNotifications),
      privacySettings: JSON.parse(prefs.privacySettings),
      defaultBatchSettings: JSON.parse(prefs.defaultBatchSettings),
      createdAt: prefs.createdAt,
      updatedAt: prefs.updatedAt,
    };
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to get user preferences",
    );
    throw error;
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>,
): Promise<UserPreferences> {
  try {
    // Ensure preferences exist
    let prefs = await prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userPreference.create({
        data: {
          userId,
          language: "en",
          timezone: "UTC",
          theme: "system",
          emailNotifications: JSON.stringify({
            batchCompleted: true,
            batchFailed: true,
            weeklyReport: false,
            monthlyReport: true,
          }),
          privacySettings: JSON.stringify({
            shareAnalytics: false,
            allowDataExport: true,
          }),
          defaultBatchSettings: JSON.stringify({
            defaultEndpoint: "optimize-full",
            autoProcess: false,
            notifyOnCompletion: true,
          }),
        },
      });
    }

    // Update with provided values
    prefs = await prisma.userPreference.update({
      where: { userId },
      data: {
        ...(updates.language && { language: updates.language }),
        ...(updates.timezone && { timezone: updates.timezone }),
        ...(updates.theme && { theme: updates.theme }),
        ...(updates.emailNotifications && {
          emailNotifications: JSON.stringify(updates.emailNotifications),
        }),
        ...(updates.privacySettings && {
          privacySettings: JSON.stringify(updates.privacySettings),
        }),
        ...(updates.defaultBatchSettings && {
          defaultBatchSettings: JSON.stringify(updates.defaultBatchSettings),
        }),
      },
    });

    logger.info({ userId }, "User preferences updated");

    return {
      userId: prefs.userId,
      language: prefs.language,
      timezone: prefs.timezone,
      theme: prefs.theme as "light" | "dark" | "system",
      emailNotifications: JSON.parse(prefs.emailNotifications),
      privacySettings: JSON.parse(prefs.privacySettings),
      defaultBatchSettings: JSON.parse(prefs.defaultBatchSettings),
      createdAt: prefs.createdAt,
      updatedAt: prefs.updatedAt,
    };
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to update user preferences",
    );
    throw error;
  }
}

/**
 * Update email notification settings
 */
export async function updateEmailNotifications(
  userId: string,
  notifications: Partial<UserPreferences["emailNotifications"]>,
): Promise<UserPreferences["emailNotifications"]> {
  try {
    // Ensure preferences exist
    const existing = await getUserPreferences(userId);

    const updated = await prisma.userPreference.update({
      where: { userId },
      data: {
        emailNotifications: JSON.stringify({
          ...existing.emailNotifications,
          ...notifications,
        }),
      },
    });

    logger.info({ userId }, "Email notification settings updated");

    return JSON.parse(updated.emailNotifications);
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to update email notifications",
    );
    throw error;
  }
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  userId: string,
  settings: Partial<UserPreferences["privacySettings"]>,
): Promise<UserPreferences["privacySettings"]> {
  try {
    // Ensure preferences exist
    const existing = await getUserPreferences(userId);

    const updated = await prisma.userPreference.update({
      where: { userId },
      data: {
        privacySettings: JSON.stringify({
          ...existing.privacySettings,
          ...settings,
        }),
      },
    });

    logger.info({ userId }, "Privacy settings updated");

    return JSON.parse(updated.privacySettings);
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to update privacy settings",
    );
    throw error;
  }
}

/**
 * Update default batch settings
 */
export async function updateDefaultBatchSettings(
  userId: string,
  settings: Partial<UserPreferences["defaultBatchSettings"]>,
): Promise<UserPreferences["defaultBatchSettings"]> {
  try {
    // Ensure preferences exist
    const existing = await getUserPreferences(userId);

    const updated = await prisma.userPreference.update({
      where: { userId },
      data: {
        defaultBatchSettings: JSON.stringify({
          ...existing.defaultBatchSettings,
          ...settings,
        }),
      },
    });

    logger.info({ userId }, "Default batch settings updated");

    return JSON.parse(updated.defaultBatchSettings);
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to update default batch settings",
    );
    throw error;
  }
}

/**
 * Reset preferences to defaults
 */
export async function resetUserPreferences(userId: string): Promise<void> {
  try {
    await prisma.userPreference.update({
      where: { userId },
      data: {
        language: "en",
        timezone: "UTC",
        theme: "system",
        emailNotifications: JSON.stringify({
          batchCompleted: true,
          batchFailed: true,
          weeklyReport: false,
          monthlyReport: true,
        }),
        privacySettings: JSON.stringify({
          shareAnalytics: false,
          allowDataExport: true,
        }),
        defaultBatchSettings: JSON.stringify({
          defaultEndpoint: "optimize-full",
          autoProcess: false,
          notifyOnCompletion: true,
        }),
      },
    });

    logger.info({ userId }, "User preferences reset to defaults");
  } catch (error: any) {
    logger.error(
      { userId, error: error.message },
      "Failed to reset user preferences",
    );
    throw error;
  }
}
