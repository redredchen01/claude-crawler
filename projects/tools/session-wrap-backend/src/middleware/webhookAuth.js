/**
 * Webhook Authentication Middleware
 * Implements HMAC signature verification for incoming webhooks
 * from Slack, GitHub, and Jira
 */

const crypto = require('crypto');

/**
 * Verify Slack webhook signature
 * Slack uses: v0=<HMAC-SHA256>
 * @param {Object} req - Express request object (must have rawBody)
 * @param {string} signingSecret - Slack app signing secret
 * @returns {boolean} true if signature is valid
 */
const verifySlackSignature = (req, signingSecret) => {
  if (!signingSecret) {
    console.warn('⚠️  Slack signing secret not configured');
    return false;
  }

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];

  if (!timestamp || !signature) {
    console.warn('⚠️  Missing Slack signature headers');
    return false;
  }

  // Prevent replay attacks (within 5 minutes)
  const requestAge = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (requestAge > 300) {
    console.warn(`⚠️  Slack request too old: ${requestAge}s`);
    return false;
  }

  // Compute expected signature
  const baseString = `v0:${timestamp}:${req.rawBody || ''}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  const computed = 'v0=' + hmac.update(baseString).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    );
  } catch (error) {
    console.warn('⚠️  Slack signature verification failed');
    return false;
  }
};

/**
 * Verify GitHub webhook signature
 * GitHub uses: sha256=<HMAC-SHA256>
 * @param {Object} req - Express request object (must have rawBody)
 * @param {string} webhookSecret - GitHub webhook secret
 * @returns {boolean} true if signature is valid
 */
const verifyGitHubSignature = (req, webhookSecret) => {
  if (!webhookSecret) {
    console.warn('⚠️  GitHub webhook secret not configured');
    return false;
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    console.warn('⚠️  Missing GitHub signature header');
    return false;
  }

  // Compute expected signature
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const computed = 'sha256=' + hmac.update(req.rawBody || '').digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    );
  } catch (error) {
    console.warn('⚠️  GitHub signature verification failed');
    return false;
  }
};

/**
 * Verify Jira webhook signature
 * Jira uses: SHA256 HMAC in X-Hub-Signature header
 * @param {Object} req - Express request object (must have rawBody)
 * @param {string} webhookSecret - Jira webhook secret
 * @returns {boolean} true if signature is valid
 */
const verifyJiraSignature = (req, webhookSecret) => {
  if (!webhookSecret) {
    console.warn('⚠️  Jira webhook secret not configured');
    return false;
  }

  const signature = req.headers['x-hub-signature'];

  if (!signature) {
    console.warn('⚠️  Missing Jira signature header');
    return false;
  }

  // Compute expected signature
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const computed = hmac.update(req.rawBody || '').digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    );
  } catch (error) {
    console.warn('⚠️  Jira signature verification failed');
    return false;
  }
};

/**
 * Middleware: Verify Slack webhook signature
 * Usage: app.post('/webhooks/slack/:workspaceId', verifySlackWebhook(signingSecret), handler)
 */
const verifySlackWebhook = (signingSecret) => {
  return (req, res, next) => {
    if (!verifySlackSignature(req, signingSecret)) {
      return res.status(401).json({ error: 'Invalid Slack signature' });
    }
    next();
  };
};

/**
 * Middleware: Verify GitHub webhook signature
 * Usage: app.post('/webhooks/github/:workspaceId', verifyGitHubWebhook(secret), handler)
 */
const verifyGitHubWebhook = (webhookSecret) => {
  return (req, res, next) => {
    if (!verifyGitHubSignature(req, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid GitHub signature' });
    }
    next();
  };
};

/**
 * Middleware: Verify Jira webhook signature
 * Usage: app.post('/webhooks/jira/:workspaceId', verifyJiraWebhook(secret), handler)
 */
const verifyJiraWebhook = (webhookSecret) => {
  return (req, res, next) => {
    if (!verifyJiraSignature(req, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid Jira signature' });
    }
    next();
  };
};

module.exports = {
  verifySlackSignature,
  verifyGitHubSignature,
  verifyJiraSignature,
  verifySlackWebhook,
  verifyGitHubWebhook,
  verifyJiraWebhook
};
