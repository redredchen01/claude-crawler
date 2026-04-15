/**
 * RBAC Authorization Middleware
 * Implements role-based access control with fine-grained permissions
 */

const { pool } = require('../db/init');

// Get all roles for a user in a workspace
async function getUserRoles(userId, workspaceId = null) {
  try {
    const query = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 ${workspaceId ? 'AND ur.workspace_id = $2' : 'AND ur.workspace_id IS NULL'}
    `;
    const params = workspaceId ? [userId, workspaceId] : [userId];
    const result = await pool.query(query, params);
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
}

// Check if user has a specific role in a workspace
async function hasRole(userId, roleName, workspaceId = null) {
  const roles = await getUserRoles(userId, workspaceId);
  return roles.includes(roleName);
}

// Get user permissions in a workspace
async function getUserPermissions(userId, workspaceId) {
  try {
    const query = `
      SELECT DISTINCT rp.permission, rp.resource_type
      FROM resource_permissions rp
      LEFT JOIN user_roles ur ON ur.user_id = rp.user_id
      WHERE (rp.user_id = $1 OR ur.user_id = $1)
        AND (rp.resource_type, rp.resource_id) IS NOT NULL
      LIMIT 1000
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.reduce((acc, row) => {
      if (!acc[row.resource_type]) acc[row.resource_type] = [];
      if (!acc[row.resource_type].includes(row.permission)) {
        acc[row.resource_type].push(row.permission);
      }
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return {};
  }
}

// Check if user has permission on a specific resource
async function checkPermission(userId, resourceType, resourceId, permission) {
  try {
    // First check explicit resource permission
    const query = `
      SELECT id FROM resource_permissions
      WHERE user_id = $1
        AND resource_type = $2
        AND resource_id = $3
        AND permission = $4
      LIMIT 1
    `;
    const result = await pool.query(query, [userId, resourceType, resourceId, permission]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

// Middleware: Check if user has a specific role
const checkRole = (requiredRoles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
      const userRoles = await getUserRoles(req.user.id, workspaceId);

      // Check if user has at least one of the required roles
      if (requiredRoles.length > 0 && !requiredRoles.some(role => userRoles.includes(role))) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required_roles: requiredRoles,
          user_roles: userRoles
        });
      }

      req.userRoles = userRoles;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

// Middleware: Check if user has permission on a resource
const checkResourcePermission = (permission = 'read') => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const resourceId = req.params.id || req.params.resourceId;
      const resourceType = req.baseUrl.split('/')[2] || 'unknown'; // e.g., 'tasks', 'decisions'

      const hasPermission = await checkPermission(
        req.user.id,
        resourceType,
        resourceId,
        permission
      );

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access denied',
          resource_type: resourceType,
          resource_id: resourceId,
          required_permission: permission
        });
      }

      next();
    } catch (error) {
      console.error('Resource permission check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Middleware: Grant permission context to request
const attachPermissions = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (workspaceId) {
      req.userPermissions = await getUserPermissions(req.user.id, workspaceId);
      req.userRoles = await getUserRoles(req.user.id, workspaceId);
    }

    next();
  } catch (error) {
    console.error('Error attaching permissions:', error);
    next();
  }
};

// Helper: Create default roles in database
async function createDefaultRoles() {
  try {
    const roles = [
      {
        name: 'admin',
        description: 'Full access',
        permissions: {
          users: ['read', 'write', 'delete'],
          tasks: ['read', 'write', 'delete'],
          decisions: ['read', 'write', 'delete'],
          analytics: ['read']
        }
      },
      {
        name: 'editor',
        description: 'Can create and edit content',
        permissions: {
          users: ['read'],
          tasks: ['read', 'write'],
          decisions: ['read', 'write'],
          analytics: ['read']
        }
      },
      {
        name: 'viewer',
        description: 'Read-only access',
        permissions: {
          users: ['read'],
          tasks: ['read'],
          decisions: ['read'],
          analytics: ['read']
        }
      }
    ];

    for (const role of roles) {
      const query = `
        INSERT INTO roles (name, description, permissions)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
      `;
      await pool.query(query, [role.name, role.description, JSON.stringify(role.permissions)]);
    }

    console.log('✅ Default roles created');
  } catch (error) {
    console.error('Error creating default roles:', error);
  }
}

module.exports = {
  getUserRoles,
  hasRole,
  getUserPermissions,
  checkPermission,
  checkRole,
  checkResourcePermission,
  attachPermissions,
  createDefaultRoles
};
