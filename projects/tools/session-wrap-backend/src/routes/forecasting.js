/**
 * Advanced Analytics & Forecasting Routes (Phase 10A)
 */

const express = require('express')
const { pool } = require('../db/init')
const { authenticateToken } = require('../middleware/auth')
const { checkRole } = require('../middleware/authorization')
const ForecastEngine = require('../utils/forecast')

const router = express.Router()

router.use(authenticateToken)
router.use(checkRole(['admin', 'editor', 'viewer']))

function parsePositiveInt(value, fallback, max = 365) {
  const parsed = Number.parseInt(value ?? String(fallback), 10)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

function parsePositiveFloat(value, fallback, max = 100) {
  const parsed = Number.parseFloat(value ?? String(fallback))
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

/**
 * GET /api/forecasting/forecast/:workspaceId
 * Generate forecasts for metrics
 */
router.get('/forecast/:workspaceId', async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    const metricType = req.query.metricType || 'completed_tasks'
    const days = parsePositiveInt(req.query.days, 30)
    const forecastHorizon = parsePositiveInt(req.query.forecastHorizon, 30, 180)

    // Fetch historical data
    const historicalQuery = `
      SELECT completed_tasks, pending_tasks, in_progress_tasks, total_decisions
      FROM analytics_snapshots
      WHERE workspace_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2
    `
    const result = await pool.query(historicalQuery, [workspaceId, days])

    if (result.rows.length < 2) {
      return res.status(400).json({
        error: 'Insufficient historical data for forecasting (need at least 2 data points)'
      })
    }

    // Extract metric values
    const timeSeries = result.rows
      .reverse()
      .map(row => {
        switch (metricType) {
          case 'completed_tasks':
            return row.completed_tasks || 0
          case 'pending_tasks':
            return row.pending_tasks || 0
          case 'in_progress_tasks':
            return row.in_progress_tasks || 0
          case 'total_decisions':
            return row.total_decisions || 0
          default:
            return row.completed_tasks || 0
        }
      })

    // Generate forecast using Holt's method (captures trend)
    const forecast = ForecastEngine.holtSmoothing(
      timeSeries,
      0.2,
      0.1,
      forecastHorizon
    )

    // Store forecast in database
    const forecastDate = new Date()
    const insertQuery = `
      INSERT INTO analytics_forecasts
      (workspace_id, forecast_date, forecast_horizon, metric_type, predicted_value, confidence_score, lower_bound, upper_bound, model_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (workspace_id, forecast_date, metric_type) DO UPDATE SET
      predicted_value = EXCLUDED.predicted_value,
      confidence_score = EXCLUDED.confidence_score,
      lower_bound = EXCLUDED.lower_bound,
      upper_bound = EXCLUDED.upper_bound
      RETURNING *
    `

    // Insert summary forecast (day 30)
    const lastForecast = forecast.forecasts[forecast.forecasts.length - 1]
    await pool.query(insertQuery, [
      workspaceId,
      forecastDate,
      forecastHorizon,
      metricType,
      lastForecast.value,
      forecast.confidence,
      lastForecast.lowerBound,
      lastForecast.upperBound,
      'holt_exponential_smoothing'
    ])

    res.json({
      data: {
        metricType,
        historicalDays: days,
        forecastHorizon,
        currentTrend: forecast.trend > 0 ? 'increasing' : 'decreasing',
        trendStrength: Math.abs(forecast.trend),
        predictions: forecast.forecasts.slice(0, 10), // Return first 10 periods
        confidenceLevel: `${(forecast.confidence * 100).toFixed(0)}%`,
        uncertainty: forecast.stdDev
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/forecasting/anomalies/:workspaceId
 * Detect anomalies in metrics
 */
router.get('/anomalies/:workspaceId', async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    const days = parsePositiveInt(req.query.days, 30)
    const threshold = parsePositiveFloat(req.query.threshold, 2.5, 10)

    // Fetch historical data
    const query = `
      SELECT completed_tasks, pending_tasks, in_progress_tasks
      FROM analytics_snapshots
      WHERE workspace_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2
    `
    const result = await pool.query(query, [workspaceId, days])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No analytics data found' })
    }

    const rows = result.rows.reverse()
    const completedTasks = rows.map(r => r.completed_tasks || 0)

    // Detect anomalies
    const anomalies = ForecastEngine.detectAnomalies(completedTasks, threshold)

    // Store anomalies in database
    const insertQuery = `
      INSERT INTO anomaly_detections
      (workspace_id, anomaly_date, metric_type, metric_value, expected_value, deviation_percentage, severity)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `

    for (const anomaly of anomalies) {
      const deviationPct = Math.abs((anomaly.value - anomaly.expectedValue) / anomaly.expectedValue * 100)
      await pool.query(insertQuery, [
        workspaceId,
        new Date(rows[anomaly.index].snapshot_date),
        'completed_tasks',
        anomaly.value,
        anomaly.expectedValue,
        deviationPct,
        anomaly.severity
      ])
    }

    res.json({
      data: {
        totalDataPoints: completedTasks.length,
        anomaliesDetected: anomalies.length,
        threshold,
        anomalies: anomalies.map(a => ({
          index: a.index,
          value: a.value,
          expectedValue: Math.round(a.expectedValue),
          deviation: `${Math.abs((a.value - a.expectedValue) / a.expectedValue * 100).toFixed(1)}%`,
          severity: a.severity,
          zScore: a.zScore.toFixed(2)
        }))
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/forecasting/insights/:workspaceId
 * Generate AI insights from forecast and anomalies
 */
router.get('/insights/:workspaceId', async (req, res, next) => {
  try {
    const { workspaceId } = req.params

    // Fetch recent forecast
    const forecastQuery = `
      SELECT metric_type, predicted_value, confidence_score, lower_bound, upper_bound, model_type
      FROM analytics_forecasts
      WHERE workspace_id = $1
      ORDER BY forecast_date DESC
      LIMIT 1
    `
    const forecastResult = await pool.query(forecastQuery, [workspaceId])

    // Fetch recent anomalies
    const anomalyQuery = `
      SELECT COUNT(*) as total, severity
      FROM anomaly_detections
      WHERE workspace_id = $1 AND is_resolved = FALSE
      GROUP BY severity
      ORDER BY severity DESC
    `
    const anomalyResult = await pool.query(anomalyQuery, [workspaceId])

    const insights = []

    // Forecast-based insights
    if (forecastResult.rows.length > 0) {
      const forecast = forecastResult.rows[0]
      const trend = forecast.predicted_value > 0 ? 'increasing' : 'decreasing'
      insights.push({
        type: 'forecast',
        message: `Metrics are trending ${trend}. Next 30-day forecast: ${Math.round(forecast.predicted_value)} tasks.`,
        confidence: `${(forecast.confidence_score * 100).toFixed(0)}%`,
        recommendation: trend === 'increasing'
          ? 'Increase team capacity or prioritize high-value tasks'
          : 'Consider load balancing or task redistribution'
      })
    }

    // Anomaly-based insights
    const criticalAnomalies = anomalyResult.rows.find(r => r.severity === 'critical')
    if (criticalAnomalies && criticalAnomalies.total > 0) {
      insights.push({
        type: 'anomaly',
        message: `${criticalAnomalies.total} critical anomalies detected in recent data.`,
        severity: 'high',
        recommendation: 'Investigate unusual patterns and verify data quality'
      })
    }

    // Overall health
    const totalAnomalies = anomalyResult.rows.reduce((sum, r) => sum + parseInt(r.total), 0)
    insights.push({
      type: 'health',
      message: `Workspace health: ${totalAnomalies === 0 ? 'Excellent' : totalAnomalies < 3 ? 'Good' : 'Needs attention'}`,
      anomalyCount: totalAnomalies,
      recommendation: totalAnomalies === 0
        ? 'All metrics are performing as expected'
        : 'Review and resolve open anomalies'
    })

    res.json({ data: insights })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/forecasting/feedback/:forecastId
 * Record feedback on forecast accuracy
 */
router.post('/feedback/:forecastId', async (req, res, next) => {
  try {
    const { forecastId } = req.params
    const { isAccurate, notes } = req.body

    const query = `
      INSERT INTO forecast_feedback (forecast_id, is_accurate, notes)
      VALUES ($1, $2, $3)
      RETURNING *
    `
    const result = await pool.query(query, [forecastId, isAccurate, notes])

    res.json({ data: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/forecasting/history/:workspaceId
 * Get forecast history
 */
router.get('/history/:workspaceId', async (req, res, next) => {
  try {
    const { workspaceId } = req.params
    const metricType = req.query.metricType
    const limit = parsePositiveInt(req.query.limit, 50, 200)
    const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0)

    let query = `
      SELECT * FROM analytics_forecasts
      WHERE workspace_id = $1
    `
    const params = [workspaceId]

    if (metricType) {
      query += ` AND metric_type = $${params.length + 1}`
      params.push(metricType)
    }

    query += ` ORDER BY forecast_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await pool.query(query, params)

    res.json({
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset,
        total: result.rows.length
      }
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
module.exports.parsePositiveInt = parsePositiveInt
module.exports.parsePositiveFloat = parsePositiveFloat
