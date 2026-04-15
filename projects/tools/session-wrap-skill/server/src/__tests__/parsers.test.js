const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temp dir for test data
const TEST_DIR = path.join(os.tmpdir(), `session-wrap-test-${Date.now()}`);

before(() => {
  fs.mkdirSync(path.join(TEST_DIR, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'knowledge'), { recursive: true });
  process.env.MEMORY_DIR = TEST_DIR;

  // Clear require cache so config picks up new env
  delete require.cache[require.resolve('../config')];
  delete require.cache[require.resolve('../parsers/tasks')];
  delete require.cache[require.resolve('../parsers/decisions')];
  delete require.cache[require.resolve('../parsers/agents')];
  delete require.cache[require.resolve('../parsers/memory-stats')];
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Tasks parser', () => {
  it('returns empty array when tasks.json missing', () => {
    const { readTasks } = require('../parsers/tasks');
    const tasks = readTasks();
    assert.deepStrictEqual(tasks, []);
  });

  it('reads and maps task status correctly', () => {
    const tasksFile = path.join(TEST_DIR, 'tasks', 'tasks.json');
    fs.writeFileSync(tasksFile, JSON.stringify({
      tasks: {
        'task-1': {
          description: 'Test task',
          status: 'pending',
          depends_on: [],
          assigned_to: null,
          created_at: '2026-03-27T00:00:00Z'
        },
        'task-2': {
          description: 'Assigned task',
          status: 'pending',
          depends_on: ['task-1'],
          assigned_to: 'claude-code',
          created_at: '2026-03-27T00:00:00Z'
        },
        'task-3': {
          description: 'Done task',
          status: 'done',
          depends_on: [],
          assigned_to: null,
          created_at: '2026-03-27T00:00:00Z'
        }
      }
    }));

    // Re-require to pick up file
    delete require.cache[require.resolve('../parsers/tasks')];
    const { readTasks } = require('../parsers/tasks');
    const tasks = readTasks();

    assert.strictEqual(tasks.length, 3);

    const t1 = tasks.find(t => t.id === 'task-1');
    assert.strictEqual(t1.status, 'pending');

    const t2 = tasks.find(t => t.id === 'task-2');
    assert.strictEqual(t2.status, 'in_progress');
    assert.deepStrictEqual(t2.depends_on, ['task-1']);

    const t3 = tasks.find(t => t.id === 'task-3');
    assert.strictEqual(t3.status, 'completed');
  });

  it('handles delete correctly', () => {
    delete require.cache[require.resolve('../parsers/tasks')];
    const { deleteTask, readTasks } = require('../parsers/tasks');

    const deleted = deleteTask('task-1');
    assert.strictEqual(deleted, true);

    const tasks = readTasks();
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks.find(t => t.id === 'task-1'), undefined);
  });

  it('returns false for deleting non-existent task', () => {
    delete require.cache[require.resolve('../parsers/tasks')];
    const { deleteTask } = require('../parsers/tasks');
    assert.strictEqual(deleteTask('nonexistent'), false);
  });
});

describe('Decisions parser', () => {
  it('returns empty array when decisions dir is empty', () => {
    const { readDecisions } = require('../parsers/decisions');
    const decisions = readDecisions();
    assert.deepStrictEqual(decisions, []);
  });

  it('parses multi-entry decision file', () => {
    const content = `
## [10:30] CLAUDE-CODE

**Decision:** Use JWT for auth

**Reasoning:** Stateless, easy to implement

**Trade-offs:**
- Token size vs session lookup

## [14:15] CURSOR

**Decision:** Add rate limiting

**Reasoning:** Prevent abuse

**Trade-offs:**
- (none documented yet)
`;
    fs.writeFileSync(
      path.join(TEST_DIR, 'decisions', '2026-03-27-auth.md'),
      content
    );

    delete require.cache[require.resolve('../parsers/decisions')];
    const { readDecisions } = require('../parsers/decisions');
    const decisions = readDecisions();

    assert.strictEqual(decisions.length, 2);
    assert.strictEqual(decisions[0].agent, 'claude-code');
    assert.strictEqual(decisions[0].decision, 'Use JWT for auth');
    assert.strictEqual(decisions[0].topic, 'auth');
    assert.strictEqual(decisions[1].agent, 'cursor');
    assert.strictEqual(decisions[1].decision, 'Add rate limiting');
  });

  it('filters by query', () => {
    delete require.cache[require.resolve('../parsers/decisions')];
    const { readDecisions } = require('../parsers/decisions');
    const filtered = readDecisions({ q: 'JWT' });
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].decision, 'Use JWT for auth');
  });

  it('filters by agent', () => {
    delete require.cache[require.resolve('../parsers/decisions')];
    const { readDecisions } = require('../parsers/decisions');
    const filtered = readDecisions({ agent: 'cursor' });
    assert.strictEqual(filtered.length, 1);
  });
});

describe('Agents/Sync parser', () => {
  it('returns synced with no agents when dir is empty', () => {
    const { readSyncStatus } = require('../parsers/agents');
    const status = readSyncStatus();
    assert.strictEqual(status.status, 'synced');
    assert.strictEqual(status.agent_count, 0);
    assert.deepStrictEqual(status.active_agents, []);
  });

  it('detects active agent from recent state file', () => {
    fs.writeFileSync(
      path.join(TEST_DIR, 'agents', 'claude-code-state.md'),
      '# Claude Code State\nWorking on tasks.'
    );

    delete require.cache[require.resolve('../parsers/agents')];
    const { readSyncStatus } = require('../parsers/agents');
    const status = readSyncStatus();
    assert.strictEqual(status.agent_count, 1);
    assert.deepStrictEqual(status.active_agents, ['claude-code']);
  });
});
