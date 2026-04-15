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

const request = require('supertest');
const express = require('express');
const { router, parseDays } = require('../routes/analytics');
const { pool } = require('../db/init');

describe('analytics helpers', () => {
  it('clamps malformed day input to a safe range', () => {
    expect(parseDays(undefined)).toBe(30);
    expect(parseDays('oops')).toBe(30);
    expect(parseDays('-5')).toBe(30);
    expect(parseDays('9999')).toBe(365);
    expect(parseDays('7')).toBe(7);
  });
});

describe('GET /analytics/dashboard/:workspaceId', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it('uses sanitized day values in SQL interpolation and response', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = express();
    app.use('/', router);

    const response = await request(app)
      .get('/analytics/dashboard/ws-1?days=1%27%20OR%201=1--')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.period_days).toBe(1);
    expect(pool.query.mock.calls[1][0]).toContain("INTERVAL '1 days'");
    expect(pool.query.mock.calls[1][0]).not.toContain('OR 1=1');
  });
});
