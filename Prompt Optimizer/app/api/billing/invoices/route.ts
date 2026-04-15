import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getTeamById } from "@/lib/teams";
import { prisma } from "@/lib/db";
import { getCustomerInvoices } from "@/lib/billing";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 100);

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId query parameter is required" },
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

    // Get Stripe customer ID
    const teamData = await prisma.team.findUnique({
      where: { id: teamId },
      select: { stripeCustomerId: true },
    });

    if (!teamData?.stripeCustomerId) {
      return NextResponse.json({
        invoices: [],
        message: "No billing set up for this team",
      });
    }

    // Get invoices from Stripe
    const invoices = await getCustomerInvoices(
      teamData.stripeCustomerId,
      limit,
    );

    logger.info(
      { teamId, invoiceCount: invoices.length },
      "Invoices retrieved",
    );

    return NextResponse.json({
      invoices,
      teamId,
      count: invoices.length,
    });
  } catch (error: any) {
    logger.error({
      route: "/api/billing/invoices",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Failed to retrieve invoices" },
      { status: 500 },
    );
  }
}
