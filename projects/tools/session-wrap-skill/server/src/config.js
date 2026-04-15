const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  MEMORY_DIR: process.env.MEMORY_DIR || path.join(
    process.env.HOME, '.claude/projects/-Users-dex-YD-2026/memory'
  ),
  AGENT_TASKS_PATH: process.env.AGENT_TASKS_PATH || path.join(
    __dirname, '..', '..', 'scripts', 'agent-tasks.sh'
  ),
  CORS_ORIGINS: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
};
