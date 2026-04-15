#!/usr/bin/env node

/**
 * Session Wrap Cloud Sync Client
 * Syncs local wrap data to cloud backend
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');

class SessionWrapClient {
  constructor(apiUrl = 'http://localhost:3000/api') {
    this.apiUrl = apiUrl;
    this.tokenPath = path.join(os.homedir(), '.session-wrap', 'token');
    this.configPath = path.join(os.homedir(), '.session-wrap', 'config.json');
  }

  // Load stored token
  async getToken() {
    try {
      if (fs.existsSync(this.tokenPath)) {
        return fs.readFileSync(this.tokenPath, 'utf8').trim();
      }
    } catch (error) {
      console.error('Failed to read token:', error.message);
    }
    return null;
  }

  // Save token
  async saveToken(token) {
    const dir = path.dirname(this.tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.tokenPath, token, 'utf8');
    fs.chmodSync(this.tokenPath, 0o600); // Read-only for owner
  }

  // Login with Claude Code token
  async login(claudeToken, githubLogin = 'unknown', email = null) {
    try {
      const response = await axios.post(`${this.apiUrl}/auth/login`, {
        claudeToken,
        githubLogin,
        email
      });

      if (response.data.success) {
        await this.saveToken(response.data.token);
        console.log('✅ Login successful');
        console.log(`   User: ${response.data.user.login}`);
        return response.data.token;
      }
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data?.error || error.message);
      throw error;
    }
  }

  // Upload wrap to cloud
  async uploadWrap(wrapData) {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Not authenticated. Run: session-wrap login');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/wraps`,
        {
          workspaceName: wrapData.workspace || 'default',
          summary: wrapData.summary || 'Auto-generated wrap',
          memorySize: wrapData.memorySize || 0,
          obsidianFilesCount: wrapData.obsidianFilesCount || 0,
          metadata: wrapData.metadata || {}
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Claude-Token': process.env.CLAUDE_CODE_TOKEN || ''
          }
        }
      );

      console.log('✅ Wrap uploaded');
      console.log(`   ID: ${response.data.wrap.id}`);
      return response.data.wrap;
    } catch (error) {
      console.error('❌ Upload failed:', error.response?.data?.error || error.message);
      throw error;
    }
  }

  // Get wrap history
  async getHistory(limit = 10) {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Not authenticated. Run: session-wrap login');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/wraps/history?limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Claude-Token': process.env.CLAUDE_CODE_TOKEN || ''
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch history:', error.response?.data?.error || error.message);
      throw error;
    }
  }

  // Get user profile
  async getProfile() {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/users/profile`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Claude-Token': process.env.CLAUDE_CODE_TOKEN || ''
          }
        }
      );

      return response.data.user;
    } catch (error) {
      console.error('❌ Failed to fetch profile:', error.message);
      throw error;
    }
  }

  // Get storage usage
  async getStorage() {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/users/storage`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Claude-Token': process.env.CLAUDE_CODE_TOKEN || ''
          }
        }
      );

      return response.data.usage;
    } catch (error) {
      console.error('❌ Failed to fetch storage:', error.message);
      throw error;
    }
  }

  // Logout
  async logout() {
    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
      console.log('✅ Logged out');
    } catch (error) {
      console.error('❌ Logout failed:', error.message);
    }
  }
}

// CLI commands
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const client = new SessionWrapClient(process.env.SESSION_WRAP_API_URL);

  try {
    switch (command) {
      case 'login':
        if (!process.env.CLAUDE_CODE_TOKEN) {
          console.error('❌ CLAUDE_CODE_TOKEN env var required');
          process.exit(1);
        }
        await client.login(process.env.CLAUDE_CODE_TOKEN, args[1] || 'unknown');
        break;

      case 'logout':
        await client.logout();
        break;

      case 'upload':
        const wrapData = JSON.parse(fs.readFileSync(args[1] || '/dev/stdin', 'utf8'));
        await client.uploadWrap(wrapData);
        break;

      case 'history':
        const history = await client.getHistory(parseInt(args[1] || 10));
        console.log(JSON.stringify(history, null, 2));
        break;

      case 'profile':
        const profile = await client.getProfile();
        console.log(JSON.stringify(profile, null, 2));
        break;

      case 'storage':
        const storage = await client.getStorage();
        console.log(JSON.stringify(storage, null, 2));
        break;

      default:
        console.log(`
Usage: session-wrap <command>

Commands:
  login          Login with Claude Code token
  logout         Logout
  upload [file]  Upload wrap (from file or stdin)
  history [N]    Show last N wraps
  profile        Show user profile
  storage        Show storage usage

Environment:
  SESSION_WRAP_API_URL   Backend URL (default: http://localhost:3000/api)
  CLAUDE_CODE_TOKEN      Your Claude Code token
        `);
    }
  } catch (error) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SessionWrapClient;
