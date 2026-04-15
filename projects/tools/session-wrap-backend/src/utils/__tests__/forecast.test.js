const ForecastEngine = require('../forecast')

describe('ForecastEngine', () => {
  // Test data
  const timeSeries = [10, 12, 11, 13, 14, 16, 15, 17, 18, 20]

  describe('exponentialSmoothing', () => {
    it('should generate forecasts with confidence bounds', () => {
      const result = ForecastEngine.exponentialSmoothing(timeSeries, 0.3, 5)

      expect(result).toHaveProperty('forecasts')
      expect(result).toHaveProperty('confidence', 0.95)
      expect(result).toHaveProperty('stdDev')

      expect(result.forecasts.length).toBe(5)
      expect(result.forecasts[0]).toHaveProperty('period', 1)
      expect(result.forecasts[0]).toHaveProperty('value')
      expect(result.forecasts[0]).toHaveProperty('lowerBound')
      expect(result.forecasts[0]).toHaveProperty('upperBound')
    })

    it('should throw error with insufficient data', () => {
      expect(() => ForecastEngine.exponentialSmoothing([1], 0.3, 5)).toThrow()
    })

    it('should have upper bound >= value >= lower bound', () => {
      const result = ForecastEngine.exponentialSmoothing(timeSeries, 0.3, 10)

      result.forecasts.forEach((f) => {
        expect(f.upperBound).toBeGreaterThanOrEqual(f.value)
        expect(f.value).toBeGreaterThanOrEqual(f.lowerBound)
      })
    })
  })

  describe('holtSmoothing', () => {
    it('should capture trend in forecasts', () => {
      const result = ForecastEngine.holtSmoothing(timeSeries, 0.2, 0.1, 5)

      expect(result).toHaveProperty('forecasts')
      expect(result).toHaveProperty('trend')
      expect(result).toHaveProperty('confidence', 0.95)

      expect(result.forecasts.length).toBe(5)

      // Check if trend is captured (later values should reflect trend)
      if (result.trend > 0) {
        expect(result.forecasts[4].value).toBeGreaterThan(result.forecasts[0].value)
      }
    })

    it('should detect positive trend in increasing data', () => {
      const increasing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const result = ForecastEngine.holtSmoothing(increasing, 0.2, 0.1, 5)

      expect(result.trend).toBeGreaterThan(0)
    })

    it('should detect negative trend in decreasing data', () => {
      const decreasing = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
      const result = ForecastEngine.holtSmoothing(decreasing, 0.2, 0.1, 5)

      expect(result.trend).toBeLessThan(0)
    })

    it('should not have negative values in lower bounds', () => {
      const result = ForecastEngine.holtSmoothing(timeSeries, 0.2, 0.1, 10)

      result.forecasts.forEach((f) => {
        expect(f.lowerBound).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('detectAnomalies', () => {
    it('should detect values beyond threshold', () => {
      const dataWithOutlier = [10, 10, 11, 10, 9, 100, 10, 11, 10, 9]
      const anomalies = ForecastEngine.detectAnomalies(dataWithOutlier, 2.5)

      expect(anomalies.length).toBeGreaterThan(0)
      expect(anomalies[0]).toHaveProperty('index')
      expect(anomalies[0]).toHaveProperty('value')
      expect(anomalies[0]).toHaveProperty('zScore')
      expect(anomalies[0]).toHaveProperty('severity')
    })

    it('should classify severity correctly', () => {
      const dataWithMultipleOutliers = [1, 1, 1, 1, 1, 50, 1, 1, 1, 1, 200, 1, 1, 1, 1]
      const anomalies = ForecastEngine.detectAnomalies(dataWithMultipleOutliers, 2.5)

      const severities = anomalies.map((a) => a.severity)
      // Should have at least high or critical severity anomalies
      expect(severities.some((s) => s === 'critical' || s === 'high')).toBe(true)
    })

    it('should not detect anomalies in normal data', () => {
      const normal = [10, 10, 11, 10, 9, 10, 11, 10, 9, 10]
      const anomalies = ForecastEngine.detectAnomalies(normal, 2.5)

      expect(anomalies.length).toBe(0)
    })

    it('should return anomalies with expected value (mean)', () => {
      const data = [10, 10, 11, 10, 9, 100, 10, 11, 10, 9]
      const anomalies = ForecastEngine.detectAnomalies(data, 2.5)

      if (anomalies.length > 0) {
        anomalies.forEach((a) => {
          expect(typeof a.expectedValue).toBe('number')
          // Mean of data is (10+10+11+10+9+100+10+11+10+9)/10 = 19
          expect(a.expectedValue).toBeCloseTo(19, 0)
        })
      }
    })
  })

  describe('movingAverage', () => {
    it('should generate constant forecast for stable data', () => {
      const stable = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
      const result = ForecastEngine.movingAverage(stable, 3, 5)

      result.forecasts.forEach((f) => {
        expect(f.value).toBeCloseTo(10, 1)
      })
    })

    it('should require minimum window size', () => {
      expect(() => ForecastEngine.movingAverage([1, 2], 5, 5)).toThrow()
    })

    it('should have confidence level 0.90', () => {
      const result = ForecastEngine.movingAverage(timeSeries, 3, 5)
      expect(result.confidence).toBe(0.9)
    })
  })

  describe('seasonalDecomposition', () => {
    it('should decompose time series into components', () => {
      const seasonal = [10, 15, 10, 15, 10, 15, 10, 15, 10, 15]
      const result = ForecastEngine.seasonalDecomposition(seasonal, 2)

      expect(result).toHaveProperty('trend')
      expect(result).toHaveProperty('seasonal')
      expect(result).toHaveProperty('residual')
      expect(result.trend.length).toBe(10)
      expect(result.seasonal.length).toBe(2)
      expect(result.residual.length).toBe(10)
    })

    it('should detect seasonal pattern', () => {
      const seasonal = [5, 15, 5, 15, 5, 15, 5, 15, 5, 15]
      const result = ForecastEngine.seasonalDecomposition(seasonal, 2)

      // Seasonal component should have variation
      const seasonalVariation = Math.abs(result.seasonal[0] - result.seasonal[1])
      expect(seasonalVariation).toBeGreaterThan(0)
    })
  })

  describe('Helper Methods', () => {
    it('_mean should calculate average correctly', () => {
      const values = [10, 20, 30]
      const mean = ForecastEngine._mean(values)
      expect(mean).toBe(20)
    })

    it('_standardDeviation should be non-negative', () => {
      const values = [10, 15, 20]
      const stdDev = ForecastEngine._standardDeviation(values)
      expect(stdDev).toBeGreaterThanOrEqual(0)
    })

    it('_calculateResiduals should return correct length', () => {
      const timeSeries = [10, 12, 11, 13, 14]
      const residuals = ForecastEngine._calculateResiduals(timeSeries, 0.3)
      expect(residuals.length).toBe(timeSeries.length - 1)
    })
  })
})
