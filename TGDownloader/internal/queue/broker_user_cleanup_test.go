package queue

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// setupTestRedis creates an in-memory Redis client for testing
func setupTestRedis(t *testing.T) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Skip test if Redis not available
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}

	// Clear any existing test data
	client.FlushDB(ctx)
	return client
}

// TestCleanupUserTasksRemovesUserQueued verifies cleanup removes user's queued tasks
func TestCleanupUserTasksRemovesQueuedTasks(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()
	userAID := int64(100)
	userBID := int64(200)

	// Enqueue tasks for User A
	taskA1 := &types.TaskPayload{
		ID:     "task-a1",
		UserID: userAID,
		URL:    "https://example.com/a1",
		Status: types.StatePending,
	}
	taskA2 := &types.TaskPayload{
		ID:     "task-a2",
		UserID: userAID,
		URL:    "https://example.com/a2",
		Status: types.StatePending,
	}

	// Enqueue tasks for User B
	taskB1 := &types.TaskPayload{
		ID:     "task-b1",
		UserID: userBID,
		URL:    "https://example.com/b1",
		Status: types.StatePending,
	}

	require.NoError(t, broker.Enqueue(ctx, taskA1, 5))
	require.NoError(t, broker.Enqueue(ctx, taskA2, 5))
	require.NoError(t, broker.Enqueue(ctx, taskB1, 5))

	// Verify queue has 3 items before cleanup
	queueKey := "queue:5"
	depthBefore, _ := client.ZCard(ctx, queueKey).Result()
	assert.Equal(t, int64(3), depthBefore)

	// Cleanup User A's tasks
	err := broker.CleanupUserTasks(ctx, userAID)
	require.NoError(t, err)

	// Verify only User B's task remains
	depthAfter, _ := client.ZCard(ctx, queueKey).Result()
	assert.Equal(t, int64(1), depthAfter)

	// Verify User B's task is still in queue
	items, _ := client.ZRange(ctx, queueKey, 0, -1).Result()
	assert.Len(t, items, 1)

	var remainingTask types.TaskPayload
	json.Unmarshal([]byte(items[0]), &remainingTask)
	assert.Equal(t, userBID, remainingTask.UserID)
	assert.Equal(t, "task-b1", remainingTask.ID)
}

// TestCleanupUserTasksRemovesClaimed verifies cleanup removes claimed tasks
func TestCleanupUserTasksRemovesClaimedTasks(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()
	userAID := int64(300)
	userBID := int64(400)

	// Manually store claimed tasks (simulating dequeue operation)
	taskA := &types.TaskPayload{
		ID:     "claimed-a1",
		UserID: userAID,
		Status: types.StatePending,
	}
	taskB := &types.TaskPayload{
		ID:     "claimed-b1",
		UserID: userBID,
		Status: types.StatePending,
	}

	payloadA, _ := json.Marshal(taskA)
	payloadB, _ := json.Marshal(taskB)

	claimedKeyA := "queue:claimed:worker-0:abc"
	claimedKeyB := "queue:claimed:worker-0:def"

	require.NoError(t, client.Set(ctx, claimedKeyA, string(payloadA), 5*time.Minute).Err())
	require.NoError(t, client.Set(ctx, claimedKeyB, string(payloadB), 5*time.Minute).Err())

	// Cleanup User A's tasks
	err := broker.CleanupUserTasks(ctx, userAID)
	require.NoError(t, err)

	// User A's claimed task should be deleted
	val, err := client.Get(ctx, claimedKeyA).Result()
	assert.Equal(t, redis.Nil, err)
	assert.Empty(t, val)

	// User B's claimed task should remain
	val, err = client.Get(ctx, claimedKeyB).Result()
	require.NoError(t, err)
	assert.NotEmpty(t, val)

	var remainingTask types.TaskPayload
	json.Unmarshal([]byte(val), &remainingTask)
	assert.Equal(t, userBID, remainingTask.UserID)
}

// TestCleanupUserTasksIsolatesBetweenUsers ensures cleanup doesn't affect other users
func TestCleanupUserTasksIsolatesBetweenUsers(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()

	// Create tasks for 4 different users
	users := []int64{111, 222, 333, 444}
	tasksPerUser := 2

	for _, userID := range users {
		for i := 0; i < tasksPerUser; i++ {
			task := &types.TaskPayload{
				ID:     "task-" + string(rune('0'+int(userID%100/10))) + "-" + string(rune('0'+int(i))),
				UserID: userID,
				Status: types.StatePending,
			}
			require.NoError(t, broker.Enqueue(ctx, task, 5))
		}
	}

	// Verify all 8 tasks in queue
	depth, _ := client.ZCard(ctx, "queue:5").Result()
	assert.Equal(t, int64(8), depth)

	// Cleanup User 222
	err := broker.CleanupUserTasks(ctx, 222)
	require.NoError(t, err)

	// Should have 6 tasks left (8 - 2 for user 222)
	depthAfter, _ := client.ZCard(ctx, "queue:5").Result()
	assert.Equal(t, int64(6), depthAfter)

	// Verify remaining tasks don't belong to User 222
	items, _ := client.ZRange(ctx, "queue:5", 0, -1).Result()
	for _, item := range items {
		var task types.TaskPayload
		json.Unmarshal([]byte(item), &task)
		assert.NotEqual(t, int64(222), task.UserID)
	}
}

// TestCleanupUserTasksHandlesNoTasks verifies cleanup works when user has no tasks
func TestCleanupUserTasksHandlesNoTasks(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()

	// Cleanup user with no tasks should not error
	err := broker.CleanupUserTasks(ctx, 999)
	assert.NoError(t, err)

	// Queue should be empty
	depth, _ := client.ZCard(ctx, "queue:5").Result()
	assert.Equal(t, int64(0), depth)
}

// TestCleanupUserTasksMultipleQueues verifies cleanup across all priority queues
func TestCleanupUserTasksMultipleQueues(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()
	userID := int64(500)

	// Enqueue tasks with different priorities
	priorities := []int{1, 5, 10}
	for _, p := range priorities {
		task := &types.TaskPayload{
			ID:     "task-priority-" + string(rune('0'+p)),
			UserID: userID,
			Status: types.StatePending,
		}
		require.NoError(t, broker.Enqueue(ctx, task, p))
	}

	// Verify all queues have items
	for _, p := range priorities {
		queueKey := "queue:" + string(rune('0'+p))
		depth, _ := client.ZCard(ctx, queueKey).Result()
		assert.Equal(t, int64(1), depth)
	}

	// Cleanup user
	err := broker.CleanupUserTasks(ctx, userID)
	require.NoError(t, err)

	// All queues should be empty for this user
	for _, p := range priorities {
		queueKey := "queue:" + string(rune('0'+p))
		depth, _ := client.ZCard(ctx, queueKey).Result()
		assert.Equal(t, int64(0), depth)
	}
}

// TestCleanupUserTasksWithMixedData ensures cleanup handles queues with other users' tasks
func TestCleanupUserTasksWithMixedData(t *testing.T) {
	client := setupTestRedis(t)
	logger := zap.NewNop()
	broker := NewBroker(client, logger)

	ctx := context.Background()

	// Add mixed tasks: users A and B
	userA := int64(600)
	userB := int64(700)

	// Interleave tasks from both users
	for i := 0; i < 5; i++ {
		taskA := &types.TaskPayload{
			ID:     "a-" + string(rune('0'+i)),
			UserID: userA,
		}
		taskB := &types.TaskPayload{
			ID:     "b-" + string(rune('0'+i)),
			UserID: userB,
		}

		broker.Enqueue(ctx, taskA, 5)
		broker.Enqueue(ctx, taskB, 5)
	}

	// Verify 10 tasks total
	depth, _ := client.ZCard(ctx, "queue:5").Result()
	assert.Equal(t, int64(10), depth)

	// Cleanup User A
	broker.CleanupUserTasks(ctx, userA)

	// Should have 5 tasks left (all User B's)
	depthAfter, _ := client.ZCard(ctx, "queue:5").Result()
	assert.Equal(t, int64(5), depthAfter)

	// Verify all remaining are User B's
	items, _ := client.ZRange(ctx, "queue:5", 0, -1).Result()
	for _, item := range items {
		var task types.TaskPayload
		json.Unmarshal([]byte(item), &task)
		assert.Equal(t, userB, task.UserID)
	}
}
