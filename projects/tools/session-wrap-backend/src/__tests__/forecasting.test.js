jest.mock('../db/init', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'user-1', userId: 'user-1' };
    next();
  },
}));

jest.mock('../middleware/authorization', () => ({
  checkRole: () => (_req, _res, next) => next(),
}));

jest.mock('../utils/forecast', () => ({
  holtSmoothing: jest.fn(() => ({
    trend: 1,
    confidence: 0.9,
    stdDev: 2,
    forecasts: [{ value: 10, lowerBound: 8, upperBound: 12 }],
  })),
  detectAnomalies: jest.fn(() => []),
}));

const request = require('supertest');
const express = require('express');
const { pool } = require('../db/init');
const ForecastEngine = require('../utils/forecast');
const router = require('../routes/forecasting');
const { parsePositiveInt, parsePositiveFloat } = require('../routes/forecasting');

describe('forecasting helpers', () => {
  it('sanitizes numeric query values', () => {
    expect(parsePositiveInt(undefined, 30)).toBe(30);
    expect(parsePositiveInt('-1', 30)).toBe(30);
    expect(parsePositiveInt('999', 30, 180)).toBe(180);
    expect(parsePositiveFloat('oops', 2.5)).toBe(2.5);
    expect(parsePositiveFloat('-3', 2.5)).toBe(2.5);
    expect(parsePositiveFloat('20', 2.5, 10)).toBe(10);
  });
});

describe('forecasting routes', () => {
  beforeEach(() => {
    pool.query.mockReset();
    ForecastEngine.holtSmoothing.mockClear();
    ForecastEngine.detectAnomalies.mockClear();
  });

  it('uses sanitized forecast query values', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          { completed_tasks: 3, pending_tasks: 1, in_progress_tasks: 1, total_decisions: 0 },
          { completed_tasks: 5, pending_tasks: 1, in_progress_tasks: 2, total_decisions: 1 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const app = express();
    app.use('/', router);

    const response = await request(app)
      .get('/forecast/ws-1?days=999&forecastHorizon=oops')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual(['ws-1', 365]);
    expect(ForecastEngine.holtSmoothing).toHaveBeenCalledWith([5, 3], 0.2, 0.1, 30);
  });

  it('uses sanitized anomaly threshold values', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ completed_tasks: 3, snapshot_date: '2026-03-30T00:00:00Z' }],
    });

    const app = express();
    app.use('/', router);

    const response = await request(app)
      .get('/anomalies/ws-1?days=-4&threshold=100')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual(['ws-1', 30]);
    expect(ForecastEngine.detectAnomalies).toHaveBeenCalledWith([3], 10);
  });
});
