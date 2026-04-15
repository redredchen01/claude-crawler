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
  getUserRoles: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { pool } = require('../db/init');
const { getUserRoles } = require('../middleware/authorization');
const { router } = require('../routes/integrations');

describe('integrations authorization', () => {
  beforeEach(() => {
    pool.query.mockReset();
    getUserRoles.mockReset();
  });

  it('blocks workspace reads when the user has no role in that workspace', async () => {
    getUserRoles.mockResolvedValue([]);

    const app = express();
    app.use('/', router);

    const response = await request(app)
      .get('/integrations/ws-1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('resolves workspace ownership before integration-id operations', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'int-1', is_active: false }] });
    getUserRoles.mockResolvedValue(['viewer']);

    const app = express();
    app.use('/', router);

    const response = await request(app)
      .put('/integrations/int-1/toggle')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(getUserRoles).toHaveBeenCalledWith('user-1', 'ws-1');
  });
});
