import { prisma } from "@/lib/db";

export interface UsageAnalytics {
  period: string;
  team?: { id: string; name: string };
  totals: {
    score_calls: number;
    optimize_calls: number;
    total_tokens: number;
    cost_estimate: number;
  };
  by_endpoint: {
    score: { calls: number; tokens: number; cost: number };
    optimize: { calls: number; tokens: number; cost: number };
  };
  by_member: Array<{
    userId: string;
    email: string;
    calls: number;
    tokens: number;
    cost: number;
  }>;
  daily_breakdown: Array<{
    date: string;
    calls: number;
    tokens: number;
    cost: number;
  }>;
}

/**
 * Calculate token count from score object
 * Simple heuristic: score complexity determines token count
 */
function estimateTokensFromScore(scoreStr: string): number {
  try {
    const score = JSON.parse(scoreStr);
    // Rough estimation: base + complexity
    return 100 + (score.total || 50) * 10;
  } catch {
    return 100;
  }
}

/**
 * Get cost estimate from tokens
 * $0.001 per 100 tokens
 */
function calculateCost(tokens: number): number {
  return (tokens / 100) * 0.001;
}

/**
 * Get usage analytics for a time period
 * @param startDate Start of period (ISO string)
 * @param endDate End of period (ISO string)
 * @param teamId Optional team ID filter
 * @param userId Optional user ID filter
 */
export async function getUsageAnalytics(
  startDate: string,
  endDate: string,
  teamId?: string,
  userId?: string,
): Promise<UsageAnalytics> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  // Ensure end date includes the entire day
  end.setHours(23, 59, 59, 999);

  // Get all optimization records in period
  const records = await prisma.optimizationRecord.findMany({
    where: {
      created_at: {
        gte: start,
        lte: end,
      },
      ...(userId && { userId }),
    },
    include: {
      user: true,
    },
  });

  // Fetch team if provided
  let team: { id: string; name: string } | undefined;
  if (teamId) {
    const teamData = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    team = teamData || undefined;
  }

  // Parse and aggregate data
  const endpointStats = {
    score: { calls: 0, tokens: 0, cost: 0 },
    optimize: { calls: 0, tokens: 0, cost: 0 },
  };

  const memberStats = new Map<
    string,
    {
      userId: string;
      email: string;
      calls: number;
      tokens: number;
      cost: number;
    }
  >();

  const dailyStats = new Map<
    string,
    { date: string; calls: number; tokens: number; cost: number }
  >();

  // Aggregate records
  for (const record of records) {
    const isOptimized = !!record.optimized_prompt;
    const endpoint = isOptimized ? "optimize" : "score";

    // Parse scores to estimate tokens
    let tokens = 0;
    try {
      if (record.raw_score) {
        tokens += estimateTokensFromScore(record.raw_score);
      }
      if (record.optimized_score) {
        tokens += estimateTokensFromScore(record.optimized_score);
      }
    } catch {
      tokens = 150; // Default fallback
    }

    const cost = calculateCost(tokens);

    // Update endpoint stats
    endpointStats[endpoint].calls++;
    endpointStats[endpoint].tokens += tokens;
    endpointStats[endpoint].cost += cost;

    // Update member stats
    if (record.userId && record.user) {
      const memberKey = record.userId;
      const current = memberStats.get(memberKey) || {
        userId: record.userId,
        email: record.user.email,
        calls: 0,
        tokens: 0,
        cost: 0,
      };

      current.calls++;
      current.tokens += tokens;
      current.cost += cost;
      memberStats.set(memberKey, current);
    }

    // Update daily stats
    const dateStr = record.created_at.toISOString().split("T")[0];
    const dailyKey = dateStr;
    const current = dailyStats.get(dailyKey) || {
      date: dateStr,
      calls: 0,
      tokens: 0,
      cost: 0,
    };

    current.calls++;
    current.tokens += tokens;
    current.cost += cost;
    dailyStats.set(dailyKey, current);
  }

  // Format period string
  const period = `${startDate.split("T")[0]}_to_${endDate.split("T")[0]}`;

  return {
    period,
    ...(team && { team }),
    totals: {
      score_calls: endpointStats.score.calls,
      optimize_calls: endpointStats.optimize.calls,
      total_tokens: endpointStats.score.tokens + endpointStats.optimize.tokens,
      cost_estimate: endpointStats.score.cost + endpointStats.optimize.cost,
    },
    by_endpoint: endpointStats,
    by_member: Array.from(memberStats.values()).sort((a, b) => b.cost - a.cost),
    daily_breakdown: Array.from(dailyStats.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

/**
 * Export analytics as CSV
 */
export function formatAsCSV(analytics: UsageAnalytics): string {
  const lines: string[] = [];

  // Header
  lines.push("Period: " + analytics.period);
  lines.push("");

  // Totals
  lines.push("Summary");
  lines.push("Score Calls,Optimize Calls,Total Tokens,Estimated Cost");
  lines.push(
    [
      analytics.totals.score_calls,
      analytics.totals.optimize_calls,
      analytics.totals.total_tokens,
      analytics.totals.cost_estimate.toFixed(4),
    ].join(","),
  );
  lines.push("");

  // By endpoint
  lines.push("By Endpoint");
  lines.push("Endpoint,Calls,Tokens,Cost");
  Object.entries(analytics.by_endpoint).forEach(([endpoint, stats]) => {
    lines.push(
      [endpoint, stats.calls, stats.tokens, stats.cost.toFixed(4)].join(","),
    );
  });
  lines.push("");

  // By member
  lines.push("By Team Member");
  lines.push("Email,Calls,Tokens,Cost");
  analytics.by_member.forEach((member) => {
    lines.push(
      [member.email, member.calls, member.tokens, member.cost.toFixed(4)].join(
        ",",
      ),
    );
  });
  lines.push("");

  // Daily breakdown
  lines.push("Daily Breakdown");
  lines.push("Date,Calls,Tokens,Cost");
  analytics.daily_breakdown.forEach((day) => {
    lines.push(
      [day.date, day.calls, day.tokens, day.cost.toFixed(4)].join(","),
    );
  });

  return lines.join("\n");
}

/**
 * Export analytics as JSON
 */
export function formatAsJSON(analytics: UsageAnalytics): string {
  return JSON.stringify(analytics, null, 2);
}

/**
 * Get current month period
 */
export function getCurrentMonthPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return { start, end };
}

/**
 * Get previous month period
 */
export function getPreviousMonthPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return { start, end };
}

/**
 * Validate date period
 */
export function validateDatePeriod(start: string, end: string): string | null {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime())) {
      return "Invalid start date";
    }

    if (isNaN(endDate.getTime())) {
      return "Invalid end date";
    }

    if (startDate > endDate) {
      return "Start date must be before end date";
    }

    // Max 365 days
    const diffDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 365) {
      return "Period cannot exceed 365 days";
    }

    return null;
  } catch {
    return "Invalid date format";
  }
}
