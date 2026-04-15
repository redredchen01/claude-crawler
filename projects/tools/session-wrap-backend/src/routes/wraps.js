const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { authenticateToken, requireClaudeSubscription } = require('../middleware/auth');

const router = express.Router();

// Save wrap (requires Claude subscription)
router.post('/', authenticateToken, requireClaudeSubscription, async (req, res) => {
  try {
    const { workspaceName, summary, memorySize, obsidianFilesCount, metadata } = req.body;
    const userId = req.user.userId;

    const result = await pool.query(
      `INSERT INTO session_wraps
       (user_id, workspace_name, wrap_date, summary, memory_size, obsidian_files_count, metadata)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [userId, workspaceName, summary, memorySize, obsidianFilesCount, metadata || {}]
    );

    const wrap = result.rows[0];
    res.status(201).json({
      success: true,
      wrap: {
        id: wrap.id,
        createdAt: wrap.created_at
      }
    });
  } catch (error) {
    console.error('Save wrap error:', error);
    res.status(500).json({ error: 'Failed to save wrap' });
  }
});

// Get wrap history (requires Claude subscription)
router.get('/history', authenticateToken, requireClaudeSubscription, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit || 50), 100);
    const offset = parseInt(req.query.offset || 0);

    const result = await pool.query(
      `SELECT id, workspace_name, wrap_date, summary, memory_size, obsidian_files_count, created_at
       FROM session_wraps
       WHERE user_id = $1
       ORDER BY wrap_date DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM session_wraps WHERE user_id = $1',
      [userId]
    );

    res.json({
      wraps: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get single wrap
router.get('/:id', authenticateToken, requireClaudeSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT * FROM session_wraps WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wrap not found' });
    }

    res.json({ wrap: result.rows[0] });
  } catch (error) {
    console.error('Get wrap error:', error);
    res.status(500).json({ error: 'Failed to fetch wrap' });
  }
});

module.exports = router;
