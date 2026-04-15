import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import {
  getUserPreferences,
  updateUserPreferences,
  updateEmailNotifications,
  updatePrivacySettings,
  updateDefaultBatchSettings,
  resetUserPreferences,
} from "@/lib/userPreferences";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const preferences = await getUserPreferences(session.user.id);

    logger.info({ userId: session.user.id }, "User preferences retrieved");

    return NextResponse.json(preferences);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/user/preferences",
        error: error.message,
      },
      "Failed to retrieve user preferences",
    );

    return NextResponse.json(
      { error: "Failed to retrieve preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const preferences = await updateUserPreferences(session.user.id, body);

    logger.info({ userId: session.user.id }, "User preferences updated");

    return NextResponse.json(preferences);
  } catch (error: any) {
    logger.error(
      {
        route: "/api/user/preferences",
        error: error.message,
      },
      "Failed to update user preferences",
    );

    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { action } = body;

    if (action === "reset") {
      await resetUserPreferences(session.user.id);

      logger.info(
        { userId: session.user.id },
        "User preferences reset to defaults",
      );

      const preferences = await getUserPreferences(session.user.id);
      return NextResponse.json(preferences);
    }

    if (action === "update-notifications") {
      const notifications = await updateEmailNotifications(
        session.user.id,
        body.notifications,
      );

      logger.info({ userId: session.user.id }, "Email notifications updated");

      return NextResponse.json({ emailNotifications: notifications });
    }

    if (action === "update-privacy") {
      const privacy = await updatePrivacySettings(
        session.user.id,
        body.privacy,
      );

      logger.info({ userId: session.user.id }, "Privacy settings updated");

      return NextResponse.json({ privacySettings: privacy });
    }

    if (action === "update-batch-settings") {
      const batch = await updateDefaultBatchSettings(
        session.user.id,
        body.settings,
      );

      logger.info({ userId: session.user.id }, "Batch settings updated");

      return NextResponse.json({ defaultBatchSettings: batch });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    logger.error(
      {
        route: "/api/user/preferences",
        error: error.message,
      },
      "Failed to process preference action",
    );

    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
