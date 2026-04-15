const jwt = require('jsonwebtoken');
const axios = require('axios');

// Verify Claude Code subscription token
async function verifyClaudeToken(token) {
  // Allow test tokens in development
  if (process.env.NODE_ENV !== 'production' && token.startsWith('sk_test_')) {
    return {
      valid: true,
      user: { id: 'test-user', email: 'test@example.com' },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }

  try {
    const response = await axios.get(`${process.env.CLAUDE_CODE_API_URL}/user/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    return {
      valid: true,
      user: response.data,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
  } catch (error) {
    console.error('Claude token verification failed:', error.message);
    return { valid: false, error: error.message };
  }
}

// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const normalizedId = decoded.id || decoded.userId;
    req.user = {
      ...decoded,
      id: normalizedId,
      userId: normalizedId,
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Claude subscription middleware
async function requireClaudeSubscription(req, res, next) {
  try {
    const claudeToken = req.headers['x-claude-token'];

    if (!claudeToken) {
      return res.status(401).json({ error: 'Claude Code subscription required' });
    }

    const verification = await verifyClaudeToken(claudeToken);

    if (!verification.valid) {
      return res.status(403).json({ error: 'Invalid Claude Code token' });
    }

    req.claudeUser = verification.user;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Subscription verification failed' });
  }
}

module.exports = {
  verifyClaudeToken,
  authenticateToken,
  requireClaudeSubscription
};
