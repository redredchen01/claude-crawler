/**
 * RBAC Routes - Workspaces, Roles, Permissions
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/init');
const {
  checkRole,
  getUserRoles,
  getUserPermissions,
  checkPermission,
  hasRole,
  createDefaultRoles
} = require('../middleware/authorization');
const { authenticateToken } = require('../middleware/auth');

// Middleware: Ensure user is authenticated
router.use(authenticateToken);

// Initialize default roles on startup
createDefaultRoles();

// ===== WORKSPACE ENDPOINTS =====

// Get all workspaces accessible to the current user
router.get('/workspaces', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get workspaces where user is a member
    const query = `
      SELECT DISTINCT w.id, w.name, w.owner_id, w.is_public, w.created_at, w.updated_at,
             ARRAY_AGG(r.name) as roles
      FROM workspaces w
      LEFT JOIN user_roles ur ON w.id = ur.workspace_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE w.owner_id = $1 OR ur.user_id = $1 OR w.is_public = true
      GROUP BY w.id, w.name, w.owner_id, w.is_public, w.created_at, w.updated_at
      ORDER BY w.created_at DESC
    `;

    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Create a new workspace
router.post('/workspaces', async (req, res) => {
  try {
    const { name, is_public } = req.body;
    const owner_id = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    // Create workspace
    const wsQuery = `
      INSERT INTO workspaces (name, owner_id, is_public)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const wsResult = await pool.query(wsQuery, [name, owner_id, is_public || false]);
    const workspace = wsResult.rows[0];

    // Get admin role
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await pool.query(roleQuery, ['admin']);
    const adminRoleId = roleResult.rows[0].id;

    // Assign owner as admin
    const urQuery = `
      INSERT INTO user_roles (user_id, role_id, workspace_id)
      VALUES ($1, $2, $3)
    `;
    await pool.query(urQuery, [owner_id, adminRoleId, workspace.id]);

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Get workspace details
router.get('/workspaces/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user has access
    const accessQuery = `
      SELECT w.* FROM workspaces w
      LEFT JOIN user_roles ur ON w.id = ur.workspace_id
      WHERE w.id = $1 AND (w.owner_id = $2 OR ur.user_id = $2 OR w.is_public = true)
    `;
    const accessResult = await pool.query(accessQuery, [id, userId]);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(accessResult.rows[0]);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    res.status(500).json({ error: 'Failed to fetch workspace' });
  }
});

// ===== WORKSPACE MEMBER ENDPOINTS =====

// Add member to workspace
router.post('/workspaces/:workspaceId/members', checkRole(['admin']), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { user_id, role_name } = req.body;

    if (!user_id || !role_name) {
      return res.status(400).json({ error: 'user_id and role_name are required' });
    }

    // Get role ID
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await pool.query(roleQuery, [role_name]);

    if (roleResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid role name' });
    }

    const roleId = roleResult.rows[0].id;

    // Assign user to workspace
    const urQuery = `
      INSERT INTO user_roles (user_id, role_id, workspace_id, granted_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, role_id, workspace_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(urQuery, [user_id, roleId, workspaceId, req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Update member role
router.put('/workspaces/:workspaceId/members/:userId', checkRole(['admin']), async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;
    const { role_name } = req.body;

    if (!role_name) {
      return res.status(400).json({ error: 'role_name is required' });
    }

    // Get role ID
    const roleQuery = 'SELECT id FROM roles WHERE name = $1';
    const roleResult = await pool.query(roleQuery, [role_name]);

    if (roleResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid role name' });
    }

    const roleId = roleResult.rows[0].id;

    // Update user role
    const query = `
      UPDATE user_roles
      SET role_id = $1
      WHERE user_id = $2 AND workspace_id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [roleId, userId, workspaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Remove member from workspace
router.delete('/workspaces/:workspaceId/members/:userId', checkRole(['admin']), async (req, res) => {
  try {
    const { workspaceId, userId } = req.params;

    const query = `
      DELETE FROM user_roles
      WHERE user_id = $1 AND workspace_id = $2
      RETURNING id
    `;
    const result = await pool.query(query, [userId, workspaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get workspace members
router.get('/workspaces/:workspaceId/members', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    // Check user access
    const accessQuery = `
      SELECT w.id FROM workspaces w
      LEFT JOIN user_roles ur ON w.id = ur.workspace_id
      WHERE w.id = $1 AND (w.owner_id = $2 OR ur.user_id = $2 OR w.is_public = true)
    `;
    const accessResult = await pool.query(accessQuery, [workspaceId, userId]);

    if (accessResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get members
    const query = `
      SELECT u.id, u.github_login, u.email, u.avatar_url,
             ARRAY_AGG(r.name) as roles
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.workspace_id = $1
      GROUP BY u.id, u.github_login, u.email, u.avatar_url
    `;
    const result = await pool.query(query, [workspaceId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ===== USER PERMISSIONS ENDPOINTS =====

// Get current user permissions
router.get('/me/permissions', async (req, res) => {
  try {
    const userId = req.user.id;
    const workspaceId = req.query.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }

    const roles = await getUserRoles(userId, workspaceId);
    const permissions = await getUserPermissions(userId, workspaceId);

    res.json({
      user_id: userId,
      workspace_id: workspaceId,
      roles,
      permissions
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Check if user has permission on a specific resource
router.get('/permissions/check', async (req, res) => {
  try {
    const userId = req.user.id;
    const { resource_type, resource_id, permission } = req.query;

    if (!resource_type || !resource_id || !permission) {
      return res.status(400).json({
        error: 'resource_type, resource_id, and permission query parameters are required'
      });
    }

    const hasPermission = await checkPermission(userId, resource_type, resource_id, permission);

    res.json({
      user_id: userId,
      resource_type,
      resource_id,
      permission,
      has_permission: hasPermission
    });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

// ===== ROLE ENDPOINTS =====

// List all available roles
router.get('/roles', async (req, res) => {
  try {
    const query = 'SELECT id, name, description, permissions FROM roles ORDER BY name';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

module.exports = router;
