const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
  verifyClaudeToken: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'signed-jwt'),
}));

const pool = require('../config/database');
const { verifyClaudeToken } = require('../middleware/auth');
const { hashToken } = require('../utils/token');
const authRouter = require('../routes/auth');

describe('POST /login', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    pool.query.mockReset();
    verifyClaudeToken.mockReset();
  });

  it('stores a hash instead of the raw Claude token', async () => {
    verifyClaudeToken.mockResolvedValue({
      valid: true,
      expiresAt: new Date('2026-04-30T00:00:00Z'),
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          github_login: 'dex',
          email: 'dex@example.com',
          created_at: '2026-03-30T00:00:00Z',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const app = express();
    app.use(express.json());
    app.use('/', authRouter);

    const claudeToken = 'sk_live_super_secret';
    const response = await request(app)
      .post('/login')
      .send({ claudeToken, githubLogin: 'dex', email: 'dex@example.com' });

    expect(response.status).toBe(200);
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO claude_subscriptions'),
      ['user-1', hashToken(claudeToken), new Date('2026-04-30T00:00:00Z')]
    );
    expect(pool.query.mock.calls[1][1][1]).not.toBe(claudeToken);
  });
});
