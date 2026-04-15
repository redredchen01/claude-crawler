/**
 * Time Series Forecasting Engine
 * Implements exponential smoothing and ARIMA-like models
 */

class ForecastEngine {
  /**
   * Simple exponential smoothing
   * @param {number[]} timeSeries - Historical values
   * @param {number} alpha - Smoothing factor (0-1)
   * @param {number} periods - Forecast periods
   * @returns {Object} Forecast with predictions and bounds
   */
  static exponentialSmoothing(timeSeries, alpha = 0.3, periods = 30) {
    if (timeSeries.length < 2) {
      throw new Error('Need at least 2 data points')
    }

    const forecasts = []
    let level = timeSeries[0]

    // Fit the model
    for (let i = 1; i < timeSeries.length; i++) {
      const prevLevel = level
      level = alpha * timeSeries[i] + (1 - alpha) * prevLevel
    }

    // Generate forecasts
    for (let i = 0; i < periods; i++) {
      forecasts.push({
        period: i + 1,
        value: level
      })
    }

    // Calculate confidence bounds
    const residuals = this._calculateResiduals(timeSeries, alpha)
    const stdDev = this._standardDeviation(residuals)
    const zScore = 1.96 // 95% confidence

    return {
      forecasts: forecasts.map(f => ({
        ...f,
        lowerBound: f.value - zScore * stdDev,
        upperBound: f.value + zScore * stdDev
      })),
      confidence: 0.95,
      stdDev
    }
  }

  /**
   * Double exponential smoothing (Holt's method)
   * Captures trend in data
   */
  static holtSmoothing(timeSeries, alpha = 0.2, beta = 0.1, periods = 30) {
    if (timeSeries.length < 2) {
      throw new Error('Need at least 2 data points')
    }

    const forecasts = []
    let level = timeSeries[0]
    let trend = timeSeries[1] - timeSeries[0]

    // Fit the model
    for (let i = 1; i < timeSeries.length; i++) {
      const prevLevel = level
      const prevTrend = trend

      level = alpha * timeSeries[i] + (1 - alpha) * (prevLevel + prevTrend)
      trend = beta * (level - prevLevel) + (1 - beta) * prevTrend
    }

    // Generate forecasts
    for (let i = 0; i < periods; i++) {
      forecasts.push({
        period: i + 1,
        value: level + (i + 1) * trend
      })
    }

    // Calculate confidence bounds
    const residuals = this._calculateResiduals(timeSeries, alpha)
    const stdDev = this._standardDeviation(residuals)
    const zScore = 1.96

    return {
      forecasts: forecasts.map(f => ({
        ...f,
        lowerBound: Math.max(0, f.value - zScore * stdDev),
        upperBound: f.value + zScore * stdDev
      })),
      confidence: 0.95,
      stdDev,
      trend: trend
    }
  }

  /**
   * Detect anomalies using z-score method
   */
  static detectAnomalies(timeSeries, threshold = 2.5) {
    const mean = this._mean(timeSeries)
    const stdDev = this._standardDeviation(timeSeries)
    const anomalies = []

    timeSeries.forEach((value, index) => {
      const zScore = Math.abs((value - mean) / stdDev)
      if (zScore > threshold) {
        anomalies.push({
          index,
          value,
          zScore,
          expectedValue: mean,
          severity: zScore > 4 ? 'critical' : zScore > 3 ? 'high' : 'medium'
        })
      }
    })

    return anomalies
  }

  /**
   * Moving average method
   */
  static movingAverage(timeSeries, window = 7, periods = 30) {
    if (timeSeries.length < window) {
      throw new Error(`Need at least ${window} data points`)
    }

    const forecasts = []
    const lastWindow = timeSeries.slice(-window)
    const avg = this._mean(lastWindow)

    for (let i = 0; i < periods; i++) {
      forecasts.push({
        period: i + 1,
        value: avg
      })
    }

    const stdDev = this._standardDeviation(timeSeries)
    const zScore = 1.96

    return {
      forecasts: forecasts.map(f => ({
        ...f,
        lowerBound: Math.max(0, f.value - zScore * stdDev),
        upperBound: f.value + zScore * stdDev
      })),
      confidence: 0.90,
      stdDev
    }
  }

  /**
   * Seasonal decomposition
   * Separates trend, seasonal, and residual components
   */
  static seasonalDecomposition(timeSeries, seasonLength = 7) {
    const trend = this._calculateTrend(timeSeries, seasonLength)
    const seasonal = this._calculateSeasonal(timeSeries, trend, seasonLength)
    const residual = timeSeries.map((val, i) => val - trend[i] - seasonal[i % seasonLength])

    return {
      trend,
      seasonal,
      residual,
      seasonLength
    }
  }

  // Private helper methods

  static _mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  static _standardDeviation(values) {
    const mean = this._mean(values)
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    return Math.sqrt(variance)
  }

  static _calculateResiduals(timeSeries, alpha) {
    const residuals = []
    let level = timeSeries[0]

    for (let i = 1; i < timeSeries.length; i++) {
      residuals.push(timeSeries[i] - level)
      level = alpha * timeSeries[i] + (1 - alpha) * level
    }

    return residuals
  }

  static _calculateTrend(timeSeries, seasonLength) {
    const trend = []
    const halfLen = Math.floor(seasonLength / 2)

    for (let i = 0; i < timeSeries.length; i++) {
      if (i < halfLen || i >= timeSeries.length - halfLen) {
        trend.push(timeSeries[i])
      } else {
        const window = timeSeries.slice(i - halfLen, i + halfLen + 1)
        trend.push(this._mean(window))
      }
    }

    return trend
  }

  static _calculateSeasonal(timeSeries, trend, seasonLength) {
    const seasonal = new Array(seasonLength).fill(0)
    const counts = new Array(seasonLength).fill(0)

    for (let i = 0; i < timeSeries.length; i++) {
      const seasonIndex = i % seasonLength
      seasonal[seasonIndex] += timeSeries[i] - trend[i]
      counts[seasonIndex]++
    }

    return seasonal.map((s, i) => counts[i] > 0 ? s / counts[i] : 0)
  }
}

module.exports = ForecastEngine
