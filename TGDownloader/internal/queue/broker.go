package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// Broker handles task enqueueing and dequeueing
type Broker struct {
	redis  *redis.Client
	logger *zap.Logger
}

// NewBroker creates a new task broker
func NewBroker(redisClient *redis.Client, logger *zap.Logger) *Broker {
	return &Broker{
		redis:  redisClient,
		logger: logger,
	}
}

// Enqueue adds a task to the queue with priority
func (b *Broker) Enqueue(ctx context.Context, task *types.TaskPayload, priority int) error {
	payload, err := json.Marshal(task)
	if err != nil {
		return err
	}

	// Enqueue to priority queue (default 5 if not specified)
	if priority == 0 {
		priority = 5
	}
	queueKey := "queue:" + string(rune('0'+priority))

	if err := b.redis.ZAdd(ctx, queueKey, redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: string(payload),
	}).Err(); err != nil {
		return err
	}

	b.logger.Debug("task enqueued",
		zap.String("task_id", task.ID),
		zap.Int("priority", priority),
	)

	return nil
}

// Dequeue claims a task from the queue (blocking, timeout in seconds)
func (b *Broker) Dequeue(ctx context.Context, workerID string, timeout time.Duration) (*types.TaskPayload, error) {
	// Try to dequeue from priority queues (high to low): 10, 5, 1
	priorities := []int{10, 5, 1}

	for _, p := range priorities {
		queueKey := "queue:" + fmt.Sprintf("%d", p)

		// Attempt non-blocking dequeue
		result, err := b.redis.ZRange(ctx, queueKey, 0, 0).Result()
		if err != nil {
			continue
		}

		if len(result) == 0 {
			continue
		}

		// Remove from main queue atomically
		member := result[0]
		removed, err := b.redis.ZRemRangeByRank(ctx, queueKey, 0, 0).Result()
		if err != nil {
			b.logger.Error("failed to remove from queue", zap.Error(err))
			continue
		}

		// Verify exactly one task was removed
		if removed != 1 {
			// Another worker claimed it first, try next task
			continue
		}

		// Store in claimed queue with TTL (5 minutes)
		claimedKey := "queue:claimed:" + workerID + ":" + member[:8] // Use first 8 chars of task payload as ID
		if err := b.redis.Set(ctx, claimedKey, member, 5*time.Minute).Err(); err != nil {
			b.logger.Error("failed to store claimed task", zap.Error(err))
			// Task was already removed from queue, add it back
			if _, err := b.redis.ZAdd(ctx, queueKey, redis.Z{
				Score:  float64(time.Now().Unix()),
				Member: member,
			}).Result(); err != nil {
				b.logger.Error("failed to restore task to queue", zap.Error(err))
			}
			continue
		}

		// Parse task
		var task types.TaskPayload
		if err := json.Unmarshal([]byte(member), &task); err != nil {
			b.logger.Error("failed to unmarshal task", zap.Error(err))
			continue
		}

		b.logger.Debug("task dequeued",
			zap.String("task_id", task.ID),
			zap.String("worker_id", workerID),
		)

		return &task, nil
	}

	// If no task found, wait a bit and return (non-blocking in this implementation)
	time.Sleep(100 * time.Millisecond)
	return nil, nil
}

// Acknowledge removes a task from the claimed queue
func (b *Broker) Acknowledge(ctx context.Context, taskID string, workerID string) error {
	// Find and delete from claimed queues
	pattern := "queue:claimed:" + workerID + ":*"
	keys, err := b.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return err
	}

	for _, key := range keys {
		b.redis.Del(ctx, key)
	}

	b.logger.Debug("task acknowledged",
		zap.String("task_id", taskID),
		zap.String("worker_id", workerID),
	)

	return nil
}

// Requeue puts a task back on the queue for retry
func (b *Broker) Requeue(ctx context.Context, task *types.TaskPayload, priority int) error {
	// Simply re-enqueue
	return b.Enqueue(ctx, task, priority)
}

// GetQueueDepth returns the current queue depth
func (b *Broker) GetQueueDepth(ctx context.Context) (int64, error) {
	var total int64
	for _, p := range []int{10, 5, 1} {
		queueKey := "queue:" + string(rune('0'+p))
		count, err := b.redis.ZCard(ctx, queueKey).Result()
		if err != nil {
			continue
		}
		total += count
	}
	return total, nil
}

// RecoverStaleTasksClaimed moves stale claimed tasks back to the queue with pagination
// Processes tasks in batches of 1000 to avoid O(n) query time for millions of tasks
func (b *Broker) RecoverStaleTasksClaimed(ctx context.Context) error {
	const batchSize = 1000
	offset := 0
	totalRecovered := 0

	for {
		// Scan claimed keys with cursor-based pagination
		var cursor uint64
		keys, nextCursor, err := b.redis.Scan(ctx, cursor, "queue:claimed:*", int64(batchSize)).Result()
		if err != nil {
			b.logger.Error("error scanning claimed tasks", zap.Error(err))
			return err
		}

		if len(keys) == 0 {
			break
		}

		batchRecovered := 0

		for _, key := range keys {
			// Get the task payload
			taskData, err := b.redis.Get(ctx, key).Result()
			if err != nil {
				// Key expired or missing, nothing to do
				continue
			}

			// Parse and re-enqueue
			var task types.TaskPayload
			if err := json.Unmarshal([]byte(taskData), &task); err != nil {
				b.logger.Error("failed to unmarshal recovered task",
					zap.String("key", key),
					zap.Error(err),
				)
				continue
			}

			// Re-enqueue with default priority
			if err := b.Enqueue(ctx, &task, 5); err != nil {
				b.logger.Error("failed to re-enqueue recovered task",
					zap.String("task_id", task.ID),
					zap.Error(err),
				)
				continue
			}

			// Delete from claimed
			if err := b.redis.Del(ctx, key).Err(); err != nil {
				b.logger.Warn("failed to delete claimed task after recovery",
					zap.String("key", key),
					zap.Error(err),
				)
			}

			batchRecovered++
			totalRecovered++
		}

		// Log batch completion
		if batchRecovered > 0 {
			b.logger.Info("recovered stale tasks batch",
				zap.Int("count", batchRecovered),
				zap.Int("offset", offset),
				zap.Int("total_recovered", totalRecovered),
			)
		}

		// Continue with next batch if there are more keys
		if nextCursor == 0 {
			break
		}
		cursor = nextCursor
		offset += batchSize
	}

	if totalRecovered > 0 {
		b.logger.Info("stale task recovery completed",
			zap.Int("total_recovered", totalRecovered),
		)
	}

	return nil
}

// CleanupUserTasks removes all tasks and queued items for a user
// Called when a user account is deleted to ensure complete isolation
// This should be paired with file deletion in the dedup manager
func (b *Broker) CleanupUserTasks(ctx context.Context, userID int64) error {
	b.logger.Info("starting cleanup of user tasks",
		zap.Int64("user_id", userID),
	)

	// Scan all queues and remove user's tasks
	var totalRemoved int64 = 0

	// Check all priority queues
	for _, p := range []int{10, 5, 1} {
		queueKey := "queue:" + string(rune('0'+p))

		// Get all items from queue
		items, err := b.redis.ZRange(ctx, queueKey, 0, -1).Result()
		if err != nil {
			b.logger.Error("failed to scan queue", zap.String("queue", queueKey), zap.Error(err))
			continue
		}

		// Filter and remove user's tasks
		for _, item := range items {
			var task types.TaskPayload
			if err := json.Unmarshal([]byte(item), &task); err != nil {
				continue // Skip malformed items
			}

			if task.UserID == userID {
				// Remove from queue
				if _, err := b.redis.ZRem(ctx, queueKey, item).Result(); err == nil {
					totalRemoved++
				}
			}
		}
	}

	// Scan and remove from claimed queue
	var cursor uint64
	for {
		keys, nextCursor, err := b.redis.Scan(ctx, cursor, "queue:claimed:*", 1000).Result()
		if err != nil {
			b.logger.Error("error scanning claimed tasks for cleanup", zap.Error(err))
			break
		}

		for _, key := range keys {
			taskData, err := b.redis.Get(ctx, key).Result()
			if err != nil {
				continue
			}

			var task types.TaskPayload
			if err := json.Unmarshal([]byte(taskData), &task); err != nil {
				continue
			}

			if task.UserID == userID {
				b.redis.Del(ctx, key)
				totalRemoved++
			}
		}

		if nextCursor == 0 {
			break
		}
		cursor = nextCursor
	}

	b.logger.Info("completed cleanup of user tasks",
		zap.Int64("user_id", userID),
		zap.Int64("removed_count", totalRemoved),
	)

	return nil
}
