const fs = require('fs');
const path = require('path');
const { MEMORY_DIR } = require('../config');

const TASKS_FILE = path.join(MEMORY_DIR, 'tasks', 'tasks.json');

function readTasksRaw() {
  try {
    const data = fs.readFileSync(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return { tasks: {} };
    throw new Error(`tasks.json parse error: ${err.message}`);
  }
}

function mapStatusToFrontend(task) {
  if (task.status === 'done') return 'completed';
  if (task.status === 'pending' && task.assigned_to) return 'in_progress';
  return 'pending';
}

function readTasks() {
  const raw = readTasksRaw();
  return Object.entries(raw.tasks || {}).map(([id, task]) => ({
    id,
    description: task.description || '',
    status: mapStatusToFrontend(task),
    assigned_to: task.assigned_to || null,
    depends_on: task.depends_on || [],
    created_at: task.created_at || new Date().toISOString(),
    completed_at: task.status === 'done' ? task.completed_at || undefined : undefined,
  }));
}

function taskExists(id) {
  const raw = readTasksRaw();
  return id in (raw.tasks || {});
}

function deleteTask(id) {
  const raw = readTasksRaw();
  if (!(id in (raw.tasks || {}))) return false;
  delete raw.tasks[id];

  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = path.join(dir, `.tasks-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2));
  fs.renameSync(tmp, TASKS_FILE);
  return true;
}

module.exports = { readTasks, readTasksRaw, taskExists, deleteTask, TASKS_FILE };
