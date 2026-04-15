const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      'SELECT id, github_login, email, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get subscription info
    const subResult = await pool.query(
      'SELECT subscription_status, verified_at, expires_at FROM claude_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    res.json({
      user: {
        ...user,
        subscription: subResult.rows[0] || null
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get storage usage
router.get('/storage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
        COUNT(*) as wrap_count,
        SUM(COALESCE(memory_size, 0)) as total_size,
        MAX(created_at) as last_wrap
      FROM session_wraps
      WHERE user_id = $1`,
      [userId]
    );

    const data = result.rows[0];
    const totalSize = parseInt(data.total_size || 0);
    const quotaBytes = 100 * 1024 * 1024; // 100 MB for free tier

    res.json({
      usage: {
        wrapsCount: parseInt(data.wrap_count),
        totalBytes: totalSize,
        quotaBytes,
        percentageUsed: Math.round((totalSize / quotaBytes) * 100),
        lastWrap: data.last_wrap
      }
    });
  } catch (error) {
    console.error('Storage error:', error);
    res.status(500).json({ error: 'Failed to fetch storage info' });
  }
});

module.exports = router;
