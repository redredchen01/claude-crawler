const fs = require('fs');
const path = require('path');
const { MEMORY_DIR } = require('../config');

const AGENTS_DIR = path.join(MEMORY_DIR, 'agents');
const ACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

function readSyncStatus() {
  const now = Date.now();
  let activeAgents = [];
  let lastSync = '';

  try {
    if (!fs.existsSync(AGENTS_DIR)) {
      return { last_sync: new Date().toISOString(), status: 'synced', agent_count: 0, active_agents: [] };
    }

    const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('-state.md'));

    for (const file of files) {
      const filepath = path.join(AGENTS_DIR, file);
      const stat = fs.statSync(filepath);
      const mtime = stat.mtime.getTime();

      if ((now - mtime) < ACTIVE_THRESHOLD) {
        const agentName = file.replace(/-state\.md$/, '');
        activeAgents.push(agentName);
      }

      if (!lastSync || stat.mtime.toISOString() > lastSync) {
        lastSync = stat.mtime.toISOString();
      }
    }
  } catch {
    return { last_sync: '', status: 'error', agent_count: 0, active_agents: [] };
  }

  // Also check MEMORY_DIR itself for last modification
  try {
    const memStat = fs.statSync(MEMORY_DIR);
    const memTime = memStat.mtime.toISOString();
    if (!lastSync || memTime > lastSync) lastSync = memTime;
  } catch { /* ignore */ }

  return {
    last_sync: lastSync || new Date().toISOString(),
    status: 'synced',
    agent_count: activeAgents.length,
    active_agents: activeAgents,
  };
}

module.exports = { readSyncStatus };
