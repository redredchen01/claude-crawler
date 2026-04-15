/**
 * Analytics Routes - Dashboard, Trends, Reports
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/authorization');

// Middleware: Ensure user is authenticated
router.use(authenticateToken);
router.use(checkRole(['admin', 'editor', 'viewer']));

function parseDays(value) {
  const parsed = Number.parseInt(value ?? '30', 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 30;
  return Math.min(parsed, 365);
}

// ===== ANALYTICS ENDPOINTS =====

// Get dashboard snapshot for a workspace
router.get('/analytics/dashboard/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseDays(req.query.days);

    // Get latest snapshot
    const snapshotQuery = `
      SELECT * FROM analytics_snapshots
      WHERE workspace_id = $1
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;
    const snapshotResult = await pool.query(snapshotQuery, [workspaceId]);
    const snapshot = snapshotResult.rows[0] || null;

    // Calculate trends
    const trendsQuery = `
      SELECT
        snapshot_date,
        total_tasks,
        completed_tasks,
        pending_tasks,
        in_progress_tasks,
        avg_completion_time,
        total_decisions,
        avg_decision_quality,
        active_agents
      FROM analytics_snapshots
      WHERE workspace_id = $1
        AND snapshot_date >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      ORDER BY snapshot_date DESC
      LIMIT 100
    `;
    const trendsResult = await pool.query(trendsQuery, [workspaceId]);

    // Calculate completion rate
    const completionRate = snapshot
      ? (snapshot.completed_tasks / (snapshot.total_tasks || 1)) * 100
      : 0;

    // Get top agents
    const agentQuery = `
      SELECT
        agent_name,
        SUM(tasks_created) as tasks_created,
        SUM(tasks_completed) as tasks_completed,
        SUM(comments_added) as comments_added,
        SUM(decisions_logged) as decisions_logged,
        AVG(response_time_ms) as avg_response_time,
        SUM(error_count) as error_count
      FROM agent_performance
      WHERE workspace_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY agent_name
      ORDER BY (tasks_completed + decisions_logged) DESC
      LIMIT 10
    `;
    const agentResult = await pool.query(agentQuery, [workspaceId]);

    res.json({
      snapshot,
      completion_rate: completionRate,
      trends: trendsResult.rows.reverse(),
      top_agents: agentResult.rows,
      period_days: days,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Get trends data
router.get('/analytics/trends/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseDays(req.query.days);

    const query = `
      SELECT
        snapshot_date,
        total_tasks,
        completed_tasks,
        pending_tasks,
        in_progress_tasks,
        avg_completion_time,
        total_decisions,
        avg_decision_quality,
        active_agents,
        agent_participation,
        memory_usage
      FROM analytics_snapshots
      WHERE workspace_id = $1
        AND snapshot_date >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      ORDER BY snapshot_date ASC
    `;

    const result = await pool.query(query, [workspaceId]);

    // Calculate trend statistics
    const trends = result.rows;
    const latest = trends[trends.length - 1];
    const previous = trends[Math.max(0, trends.length - 2)];

    const calculateTrendPercentage = (current, prev) => {
      if (!prev || prev === 0) return 0;
      return ((current - prev) / prev) * 100;
    };

    res.json({
      period_days: days,
      trends,
      trend_changes: {
        completion_rate: calculateTrendPercentage(
          (latest?.completed_tasks || 0) / (latest?.total_tasks || 1),
          (previous?.completed_tasks || 0) / (previous?.total_tasks || 1)
        ),
        decision_quality: calculateTrendPercentage(
          latest?.avg_decision_quality,
          previous?.avg_decision_quality
        ),
        active_agents: calculateTrendPercentage(
          latest?.active_agents,
          previous?.active_agents
        )
      },
      summary: {
        total_tasks: latest?.total_tasks,
        completed_tasks: latest?.completed_tasks,
        pending_tasks: latest?.pending_tasks,
        in_progress_tasks: latest?.in_progress_tasks
      }
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Get agent performance
router.get('/analytics/agents/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseDays(req.query.days);

    const query = `
      SELECT
        agent_name,
        SUM(tasks_created) as tasks_created,
        SUM(tasks_completed) as tasks_completed,
        SUM(comments_added) as comments_added,
        SUM(decisions_logged) as decisions_logged,
        AVG(response_time_ms) as avg_response_time,
        SUM(error_count) as error_count,
        COUNT(DISTINCT date) as active_days
      FROM agent_performance
      WHERE workspace_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY agent_name
      ORDER BY (tasks_completed + decisions_logged) DESC
    `;

    const result = await pool.query(query, [workspaceId]);

    // Calculate scores
    const agents = result.rows.map(agent => ({
      ...agent,
      total_contributions: parseInt(agent.tasks_created) + parseInt(agent.decisions_logged),
      efficiency_score: parseInt(agent.tasks_completed) / (parseInt(agent.tasks_created) || 1),
      error_rate: agent.error_count / (parseInt(agent.tasks_created) + parseInt(agent.decisions_logged) || 1)
    }));

    res.json({
      period_days: days,
      agents: agents.sort((a, b) => b.total_contributions - a.total_contributions)
    });
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({ error: 'Failed to fetch agent performance' });
  }
});

// Get decision analytics
router.get('/analytics/decisions/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseDays(req.query.days);

    const query = `
      SELECT
        decision_id,
        agent,
        sentiment_score,
        complexity_score,
        reasoning_quality,
        follow_up_required,
        created_at
      FROM decision_analytics
      WHERE workspace_id = $1
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [workspaceId]);

    // Calculate aggregates
    const decisions = result.rows;
    const avgSentiment = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + (d.sentiment_score || 0), 0) / decisions.length
      : 0;

    const avgComplexity = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + (d.complexity_score || 0), 0) / decisions.length
      : 0;

    const avgReasoningQuality = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + (d.reasoning_quality || 0), 0) / decisions.length
      : 0;

    const followUpRequired = decisions.filter(d => d.follow_up_required).length;

    res.json({
      period_days: days,
      total_decisions: decisions.length,
      decisions,
      analytics: {
        avg_sentiment: avgSentiment,
        avg_complexity: avgComplexity,
        avg_reasoning_quality: avgReasoningQuality,
        follow_up_required: followUpRequired,
        follow_up_rate: (followUpRequired / (decisions.length || 1)) * 100
      }
    });
  } catch (error) {
    console.error('Error fetching decision analytics:', error);
    res.status(500).json({ error: 'Failed to fetch decision analytics' });
  }
});

// Generate insights
router.get('/analytics/insights/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const days = parseDays(req.query.days);

    // Fetch relevant data
    const snapshotQuery = `
      SELECT * FROM analytics_snapshots
      WHERE workspace_id = $1
        AND snapshot_date >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      ORDER BY snapshot_date DESC
      LIMIT 100
    `;
    const snapshots = (await pool.query(snapshotQuery, [workspaceId])).rows;

    const decisionQuery = `
      SELECT avg_decision_quality, follow_up_required
      FROM decision_analytics
      WHERE workspace_id = $1
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
    `;
    const decisions = (await pool.query(decisionQuery, [workspaceId])).rows;

    const agentQuery = `
      SELECT agent_name, COUNT(*) as activity_count
      FROM agent_performance
      WHERE workspace_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY agent_name
    `;
    const agents = (await pool.query(agentQuery, [workspaceId])).rows;

    const insights = generateInsights(snapshots, decisions, agents);

    res.json({
      period_days: days,
      insights,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Helper function: Generate AI insights
function generateInsights(snapshots, decisions, agents) {
  const insights = [];

  if (snapshots.length === 0) {
    return [{ type: 'info', message: 'No data available yet', recommendation: 'Start creating tasks and decisions' }];
  }

  const latest = snapshots[0];
  const previous = snapshots[snapshots.length - 1];

  // Insight 1: Task completion rate
  if (latest) {
    const completionRate = latest.completed_tasks / (latest.total_tasks || 1);
    if (completionRate > 0.8) {
      insights.push({
        type: 'positive',
        message: `任務完成速度提升至 ${(completionRate * 100).toFixed(1)}%`,
        recommendation: '保持當前節奏'
      });
    } else if (completionRate < 0.3) {
      insights.push({
        type: 'warning',
        message: `任務完成速度較低 (${(completionRate * 100).toFixed(1)}%)`,
        recommendation: '考慮分解大型任務或增加資源'
      });
    }
  }

  // Insight 2: Decision quality trend
  if (decisions.length > 0) {
    const avgQuality = decisions.reduce((sum, d) => sum + (d.avg_decision_quality || 0), 0) / decisions.length;
    const followUpRate = decisions.filter(d => d.follow_up_required).length / decisions.length;

    if (avgQuality < 0.5) {
      insights.push({
        type: 'warning',
        message: '最近決策質量有所下降',
        recommendation: '考慮增加決策前的討論時間'
      });
    }

    if (followUpRate > 0.3) {
      insights.push({
        type: 'info',
        message: `${(followUpRate * 100).toFixed(1)}% 的決策需要跟進`,
        recommendation: '建立跟進機制以確保決策實施'
      });
    }
  }

  // Insight 3: Agent participation balance
  if (agents.length > 1) {
    const activities = agents.map(a => a.activity_count);
    const maxActivity = Math.max(...activities);
    const minActivity = Math.min(...activities);
    const imbalance = (maxActivity - minActivity) / (maxActivity || 1);

    if (imbalance > 0.5) {
      insights.push({
        type: 'info',
        message: `代理參與不平衡 (差異 ${(imbalance * 100).toFixed(1)}%)`,
        recommendation: '考慮重新分配任務或提供支援'
      });
    }
  }

  // Insight 4: Workload distribution
  if (latest) {
    const workload = {
      pending: latest.pending_tasks || 0,
      in_progress: latest.in_progress_tasks || 0,
      completed: latest.completed_tasks || 0
    };

    if (workload.pending > workload.completed * 2) {
      insights.push({
        type: 'warning',
        message: `待處理任務堆積 (${workload.pending} 個)`,
        recommendation: '優先處理積壓任務'
      });
    }
  }

  // Insight 5: Positive reinforcement
  if (insights.length === 0) {
    insights.push({
      type: 'positive',
      message: '所有指標保持穩定',
      recommendation: '繼續當前的工作流程'
    });
  }

  return insights;
}

// Export for testing
module.exports = { router, generateInsights };
module.exports.parseDays = parseDays;
