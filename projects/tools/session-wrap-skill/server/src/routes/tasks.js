const { Router } = require('express');
const { execFileSync } = require('child_process');
const { readTasks, taskExists, deleteTask } = require('../parsers/tasks');
const { AGENT_TASKS_PATH } = require('../config');
const fs = require('fs');

const router = Router();
const TASK_ID_PATTERN = /^[a-z0-9-]+$/;

function isValidTaskId(value) {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}

function normalizeCreatePayload(body = {}) {
  const { id, description, depends_on, assigned_to } = body;

  if (!id || !description) {
    return { error: 'id and description are required', status: 400 };
  }

  if (!isValidTaskId(id)) {
    return { error: 'id must be lowercase alphanumeric with hyphens', status: 400 };
  }

  if (typeof description !== 'string' || !description.trim()) {
    return { error: 'description must be a non-empty string', status: 400 };
  }

  if (depends_on !== undefined) {
    if (!Array.isArray(depends_on) || depends_on.some(dep => !isValidTaskId(dep))) {
      return { error: 'depends_on must be an array of task ids', status: 400 };
    }
  }

  if (assigned_to !== undefined && assigned_to !== null) {
    if (typeof assigned_to !== 'string' || !assigned_to.trim()) {
      return { error: 'assigned_to must be a non-empty string', status: 400 };
    }
  }

  return {
    value: {
      id,
      description: description.trim(),
      depends_on: depends_on || [],
      assigned_to: assigned_to?.trim() || null,
    }
  };
}

function normalizePatchPayload(body = {}) {
  const { status, assigned_to } = body;

  if (status !== undefined && status !== 'completed') {
    return { error: 'status can only be set to completed', status: 400 };
  }

  if (assigned_to !== undefined && assigned_to !== null) {
    if (typeof assigned_to !== 'string' || !assigned_to.trim()) {
      return { error: 'assigned_to must be a non-empty string', status: 400 };
    }
  }

  return {
    value: {
      status,
      assigned_to: assigned_to === undefined ? undefined : (assigned_to?.trim() || null),
    }
  };
}

function runAgentTasks(command, ...args) {
  execFileSync('bash', [AGENT_TASKS_PATH, command, ...args], {
    timeout: 5000,
    stdio: 'pipe',
  });
}

router.get('/tasks', (req, res) => {
  try {
    const tasks = readTasks();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', (req, res) => {
  try {
    const parsed = normalizeCreatePayload(req.body);
    if (parsed.error) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    const { id, description, depends_on, assigned_to } = parsed.value;

    if (taskExists(id)) {
      return res.status(409).json({ error: `Task '${id}' already exists` });
    }

    if (!fs.existsSync(AGENT_TASKS_PATH)) {
      return res.status(500).json({ error: 'agent-tasks.sh not found. Run setup first.' });
    }

    runAgentTasks('add', id, description, ...depends_on);

    if (assigned_to) {
      runAgentTasks('claim', id, assigned_to);
    }

    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    res.status(201).json({ task: task || null });
  } catch (err) {
    res.status(500).json({ error: `Failed to create task: ${err.message}` });
  }
});

router.patch('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const parsed = normalizePatchPayload(req.body);
    if (parsed.error) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    const { status, assigned_to } = parsed.value;

    if (!taskExists(id)) {
      return res.status(404).json({ error: `Task '${id}' not found` });
    }

    if (!fs.existsSync(AGENT_TASKS_PATH)) {
      return res.status(500).json({ error: 'agent-tasks.sh not found. Run setup first.' });
    }

    if (status === 'completed') {
      runAgentTasks('done', id);
    }

    if (assigned_to !== undefined) {
      const agent = assigned_to || 'unknown';
      runAgentTasks('claim', id, agent);
    }

    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    res.json({ task: task || null });
  } catch (err) {
    res.status(500).json({ error: `Failed to update task: ${err.message}` });
  }
});

router.delete('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteTask(id);
    if (!deleted) {
      return res.status(404).json({ error: `Task '${id}' not found` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete task: ${err.message}` });
  }
});

module.exports = router;
module.exports.isValidTaskId = isValidTaskId;
module.exports.normalizeCreatePayload = normalizeCreatePayload;
module.exports.normalizePatchPayload = normalizePatchPayload;
