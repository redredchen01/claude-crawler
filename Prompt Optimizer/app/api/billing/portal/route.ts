import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getTeamById } from "@/lib/teams";
import { prisma } from "@/lib/db";
import { getBillingPortalSession } from "@/lib/billing";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { teamId, returnUrl } = body;

    if (!teamId || !returnUrl) {
      return NextResponse.json(
        { error: "teamId and returnUrl are required" },
        { status: 400 },
      );
    }

    // Verify user is team member
    const team = await getTeamById(teamId, session.user.id);
    if (!team) {
      return NextResponse.json(
        { error: "Team not found or access denied" },
        { status: 403 },
      );
    }

    // Get Stripe customer ID from database
    const teamData = await prisma.team.findUnique({
      where: { id: teamId },
      select: { stripeCustomerId: true },
    });

    if (!teamData?.stripeCustomerId) {
      return NextResponse.json(
        {
          error: "Team billing not set up. Create a billing customer first.",
        },
        { status: 400 },
      );
    }

    // Get billing portal session
    const portalSession = await getBillingPortalSession(
      teamId,
      teamData.stripeCustomerId,
      returnUrl,
    );

    logger.info(
      { teamId, portalUrl: portalSession.url },
      "Portal session created",
    );

    return NextResponse.json({
      url: portalSession.url,
      expiresAt: portalSession.expiresAt,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/billing/portal",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 },
    );
  }
}
