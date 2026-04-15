const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { verifyClaudeToken } = require('../middleware/auth');
const { hashToken } = require('../utils/token');

const router = express.Router();

// Login with Claude Code token
router.post('/login', async (req, res) => {
  try {
    const { claudeToken, githubLogin, email } = req.body;

    if (!claudeToken) {
      return res.status(400).json({ error: 'Claude token required' });
    }

    // Verify Claude token
    const verification = await verifyClaudeToken(claudeToken);
    if (!verification.valid) {
      return res.status(403).json({ error: 'Invalid Claude Code token' });
    }

    // Get or create user
    const result = await pool.query(
      `INSERT INTO users (github_login, email)
       VALUES ($1, $2)
       ON CONFLICT (github_login) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, github_login, email, created_at`,
      [githubLogin || 'unknown', email || null]
    );

    const user = result.rows[0];

    // Store Claude subscription
    await pool.query(
      `INSERT INTO claude_subscriptions (user_id, claude_token, subscription_status, verified_at, expires_at)
       VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         claude_token = EXCLUDED.claude_token,
         verified_at = CURRENT_TIMESTAMP,
         expires_at = EXCLUDED.expires_at`,
      [user.id, hashToken(claudeToken), verification.expiresAt]
    );

    // Generate JWT
    const jwtToken = jwt.sign(
      { id: user.id, userId: user.id, login: user.github_login },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        login: user.github_login,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token
router.post('/verify', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(403).json({ valid: false, error: 'Invalid token' });
  }
});

module.exports = router;
