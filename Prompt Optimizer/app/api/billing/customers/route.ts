import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getTeamById } from "@/lib/teams";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { teamId } = body;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    // Verify user is team admin
    const team = await getTeamById(teamId, session.user.id);
    if (!team) {
      return NextResponse.json(
        { error: "Team not found or access denied" },
        { status: 403 },
      );
    }

    // Check if user is admin
    const isMember = team.members?.some(
      (m) => m.userId === session.user.id && m.role === "admin",
    );
    if (!isMember) {
      return NextResponse.json(
        { error: "Only team admins can manage billing" },
        { status: 403 },
      );
    }

    // Create or get Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer(
      teamId,
      session.user.email || "",
      team.name,
    );

    logger.info({ teamId, stripeCustomerId }, "Stripe customer created");

    return NextResponse.json({
      stripeCustomerId,
      teamId,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/billing/customers",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to create billing customer" },
      { status: 500 },
    );
  }
}
