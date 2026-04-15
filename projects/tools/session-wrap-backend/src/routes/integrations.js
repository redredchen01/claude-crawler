/**
 * External Integrations Routes - Slack, GitHub, Jira
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../db/init');
const { authenticateToken } = require('../middleware/auth');
const { getUserRoles } = require('../middleware/authorization');

// Middleware: Ensure user is authenticated
router.use(authenticateToken);

async function requireWorkspaceAccess(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId;
    const roles = await getUserRoles(req.user.id, workspaceId);

    if (!roles.some(role => ['admin', 'editor', 'viewer'].includes(role))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.userRoles = roles;
    next();
  } catch (error) {
    console.error('Workspace access check failed:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

async function attachWorkspaceIdFromIntegration(req, res, next) {
  try {
    const { integrationId } = req.params;
    const result = await pool.query(
      'SELECT workspace_id FROM integrations WHERE id = $1',
      [integrationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    req.params.workspaceId = result.rows[0].workspace_id;
    next();
  } catch (error) {
    console.error('Integration lookup failed:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

// ===== INTEGRATION MANAGEMENT ENDPOINTS =====

// Get integrations for a workspace
router.get('/integrations/:workspaceId', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const query = `
      SELECT id, service_name, is_active, created_at, updated_at
      FROM integrations
      WHERE workspace_id = $1
      ORDER BY service_name
    `;

    const result = await pool.query(query, [workspaceId]);

    res.json({
      workspace_id: workspaceId,
      integrations: result.rows
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// Setup/update integration
router.post('/integrations/:workspaceId/setup', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { service_name, config } = req.body;

    if (!service_name || !config) {
      return res.status(400).json({ error: 'service_name and config are required' });
    }

    // Validate config based on service
    validateIntegrationConfig(service_name, config);

    const query = `
      INSERT INTO integrations (workspace_id, service_name, config)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, service_name)
      DO UPDATE SET config = $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [workspaceId, service_name, JSON.stringify(config)]);

    res.json({
      message: `${service_name} integration configured`,
      integration: result.rows[0]
    });
  } catch (error) {
    console.error('Error setting up integration:', error);
    res.status(400).json({ error: error.message || 'Failed to setup integration' });
  }
});

// Disable/enable integration
router.put('/integrations/:integrationId/toggle', attachWorkspaceIdFromIntegration, requireWorkspaceAccess, async (req, res) => {
  try {
    const { integrationId } = req.params;

    const query = `
      UPDATE integrations
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [integrationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling integration:', error);
    res.status(500).json({ error: 'Failed to toggle integration' });
  }
});

// Delete integration
router.delete('/integrations/:integrationId', attachWorkspaceIdFromIntegration, requireWorkspaceAccess, async (req, res) => {
  try {
    const { integrationId } = req.params;

    const query = 'DELETE FROM integrations WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [integrationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// Get integration events
router.get('/integrations/:integrationId/events', attachWorkspaceIdFromIntegration, requireWorkspaceAccess, async (req, res) => {
  try {
    const { integrationId } = req.params;
    const limit = req.query.limit || 50;

    const query = `
      SELECT id, event_type, status, error_message, payload, created_at
      FROM integration_events
      WHERE integration_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [integrationId, limit]);

    res.json({
      integration_id: integrationId,
      events: result.rows
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ===== SLACK INTEGRATION =====

// Send test message to Slack
router.post('/integrations/:workspaceId/slack/test', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const config = await getIntegrationConfig(workspaceId, 'slack');

    if (!config || !config.webhook_url) {
      return res.status(400).json({ error: 'Slack webhook not configured' });
    }

    const message = {
      text: '✅ YD 2026 Slack 集成測試',
      color: '#36a64f',
      fields: [
        { title: '狀態', value: 'Successfully connected!' }
      ]
    };

    await axios.post(config.webhook_url, message);

    await logIntegrationEvent(workspaceId, 'slack', 'test', 'success', { message });

    res.json({ message: 'Test message sent to Slack' });
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({ error: 'Failed to send test message' });
  }
});

// ===== GITHUB INTEGRATION =====

// Test GitHub connection
router.post('/integrations/:workspaceId/github/test', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const config = await getIntegrationConfig(workspaceId, 'github');

    if (!config || !config.api_token) {
      return res.status(400).json({ error: 'GitHub token not configured' });
    }

    // Verify token by fetching user info
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${config.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    await logIntegrationEvent(workspaceId, 'github', 'test', 'success', { user: response.data });

    res.json({ message: 'GitHub connection successful', user: response.data.login });
  } catch (error) {
    console.error('Error testing GitHub:', error);
    await logIntegrationEvent(workspaceId, 'github', 'test', 'failed', {}, error.message);
    res.status(500).json({ error: 'GitHub connection failed' });
  }
});

// ===== JIRA INTEGRATION =====

// Test Jira connection
router.post('/integrations/:workspaceId/jira/test', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const config = await getIntegrationConfig(workspaceId, 'jira');

    if (!config || !config.host || !config.email || !config.api_token) {
      return res.status(400).json({ error: 'Jira credentials not configured' });
    }

    // Verify connection by fetching myself
    const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
    const response = await axios.get(`${config.host}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    await logIntegrationEvent(workspaceId, 'jira', 'test', 'success', { user: response.data });

    res.json({ message: 'Jira connection successful', user: response.data.displayName });
  } catch (error) {
    console.error('Error testing Jira:', error);
    await logIntegrationEvent(workspaceId, 'jira', 'test', 'failed', {}, error.message);
    res.status(500).json({ error: 'Jira connection failed' });
  }
});

// ===== HELPER FUNCTIONS =====

// Get integration config for a workspace
async function getIntegrationConfig(workspaceId, serviceName) {
  try {
    const query = `
      SELECT config FROM integrations
      WHERE workspace_id = $1 AND service_name = $2 AND is_active = true
    `;
    const result = await pool.query(query, [workspaceId, serviceName]);
    return result.rows.length > 0 ? result.rows[0].config : null;
  } catch (error) {
    console.error('Error getting integration config:', error);
    return null;
  }
}

// Log integration event
async function logIntegrationEvent(workspaceId, serviceName, eventType, status, payload, errorMessage = null) {
  try {
    const integrationQuery = `
      SELECT id FROM integrations
      WHERE workspace_id = $1 AND service_name = $2
    `;
    const integrationResult = await pool.query(integrationQuery, [workspaceId, serviceName]);
    const integrationId = integrationResult.rows[0]?.id;

    const query = `
      INSERT INTO integration_events (workspace_id, integration_id, event_type, status, payload, error_message)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await pool.query(query, [workspaceId, integrationId, eventType, status, JSON.stringify(payload), errorMessage]);
  } catch (error) {
    console.error('Error logging integration event:', error);
  }
}

// Validate integration config
function validateIntegrationConfig(serviceName, config) {
  switch (serviceName) {
    case 'slack':
      if (!config.webhook_url || !config.webhook_url.startsWith('https://hooks.slack.com')) {
        throw new Error('Invalid Slack webhook URL');
      }
      break;

    case 'github':
      if (!config.api_token || !config.owner || !config.repo) {
        throw new Error('GitHub requires: api_token, owner, repo');
      }
      break;

    case 'jira':
      if (!config.host || !config.email || !config.api_token || !config.project_key) {
        throw new Error('Jira requires: host, email, api_token, project_key');
      }
      break;

    default:
      throw new Error('Unknown service');
  }
}

// Export helper functions
module.exports = { router, getIntegrationConfig, logIntegrationEvent };
module.exports.requireWorkspaceAccess = requireWorkspaceAccess;
module.exports.attachWorkspaceIdFromIntegration = attachWorkspaceIdFromIntegration;
