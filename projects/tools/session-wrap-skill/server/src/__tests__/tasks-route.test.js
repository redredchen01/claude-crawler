const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  isValidTaskId,
  normalizeCreatePayload,
  normalizePatchPayload,
} = require('../routes/tasks');

describe('tasks route validation helpers', () => {
  it('accepts safe task ids and rejects invalid ids', () => {
    assert.strictEqual(isValidTaskId('task-123'), true);
    assert.strictEqual(isValidTaskId('Task-123'), false);
    assert.strictEqual(isValidTaskId('task 123'), false);
    assert.strictEqual(isValidTaskId('../task'), false);
  });

  it('rejects non-array or invalid depends_on values', () => {
    assert.strictEqual(
      normalizeCreatePayload({ id: 'task-1', description: 'desc', depends_on: 'task-0' }).error,
      'depends_on must be an array of task ids'
    );
    assert.strictEqual(
      normalizeCreatePayload({ id: 'task-1', description: 'desc', depends_on: ['ok-task', 'bad id'] }).error,
      'depends_on must be an array of task ids'
    );
  });

  it('normalizes create payload strings without rejecting quoted content', () => {
    const parsed = normalizeCreatePayload({
      id: 'task-1',
      description: '  ship "$(rm -rf /)" safely  ',
      depends_on: ['task-0'],
      assigned_to: '  claude-code  ',
    });

    assert.deepStrictEqual(parsed.value, {
      id: 'task-1',
      description: 'ship "$(rm -rf /)" safely',
      depends_on: ['task-0'],
      assigned_to: 'claude-code',
    });
  });

  it('rejects unsupported patch status values', () => {
    assert.strictEqual(
      normalizePatchPayload({ status: 'pending' }).error,
      'status can only be set to completed'
    );
  });
});
