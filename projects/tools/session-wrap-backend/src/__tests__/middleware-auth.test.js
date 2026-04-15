jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

describe('authenticateToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    jwt.verify.mockReset();
  });

  it('normalizes req.user.id and req.user.userId from legacy payloads', () => {
    jwt.verify.mockReturnValue({ userId: 'user-1', login: 'dex' });
    const req = { headers: { authorization: 'Bearer token' } };
    const res = { status: jest.fn(() => ({ json: jest.fn() })) };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'user-1', userId: 'user-1', login: 'dex' });
  });
});
