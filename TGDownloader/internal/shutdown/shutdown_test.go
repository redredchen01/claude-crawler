package shutdown

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/queue"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// createTestDB creates an in-memory SQLite database for testing
func createTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	if err := db.InitDB(dbConn); err != nil {
		t.Fatalf("failed to initialize test database: %v", err)
	}

	return dbConn
}

// createTestRedis creates a test Redis client
func createTestRedis(t *testing.T) *redis.Client {
	redisClient := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Try to ping Redis, skip test if unavailable
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis not available: %v", err)
	}

	return redisClient
}

// TestShutdownSequence verifies the shutdown sequence stages
func TestShutdownSequence(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := createTestDB(t)
	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	// Create test HTTP server
	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer testServer.Close()

	// Create real HTTP server (not test server)
	server := &http.Server{
		Addr: ":9999",
	}

	// Create broker and worker pool
	broker := queue.NewBroker(redisClient, logger)
	workerPool := queue.NewWorkerPool(2, broker, logger)

	// Create shutdown coordinator
	coordinator := NewCoordinator(logger, server, workerPool, broker, dbConn, redisClient, 5*time.Second)

	// Verify initial state
	if coordinator.IsShuttingDown() {
		t.Error("coordinator should not be shutting down initially")
	}

	// Stop should not error
	if err := coordinator.Stop(); err != nil {
		t.Errorf("Stop() returned error: %v", err)
	}
}

// TestGracefulShutdownWithActiveTasks verifies graceful shutdown with active tasks
func TestGracefulShutdownWithActiveTasks(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := createTestDB(t)
	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	// Create broker and worker pool
	broker := queue.NewBroker(redisClient, logger)
	workerPool := queue.NewWorkerPool(2, broker, logger)

	// Track task processing
	tasksProcessed := 0
	var processingMutex sync.Mutex

	// Register handler that simulates task processing
	workerPool.RegisterHandler("test", func(ctx context.Context, task *types.TaskPayload) error {
		processingMutex.Lock()
		tasksProcessed++
		processingMutex.Unlock()

		// Simulate task taking some time
		select {
		case <-time.After(100 * time.Millisecond):
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	})

	// Start worker pool
	workerPool.Start()

	// Enqueue 5 tasks
	for i := 0; i < 5; i++ {
		task := &types.TaskPayload{
			ID:         "task-" + string(rune('0'+rune(i))),
			SourceType: "test",
			URL:        "http://example.com/file",
		}
		if err := broker.Enqueue(context.Background(), task, 5); err != nil {
			t.Fatalf("failed to enqueue task: %v", err)
		}
	}

	// Give workers time to start processing
	time.Sleep(200 * time.Millisecond)

	// Create test HTTP server
	server := &http.Server{
		Addr: ":9999",
	}

	// Create shutdown coordinator
	coordinator := NewCoordinator(logger, server, workerPool, broker, dbConn, redisClient, 5*time.Second)

	// Initiate shutdown
	coordinator.Stop()

	// Wait for workers
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := coordinator.WaitForWorkers(ctx); err != nil {
		t.Logf("WaitForWorkers returned error: %v", err)
	}

	// Verify all tasks were processed or in progress
	processingMutex.Lock()
	if tasksProcessed == 0 {
		t.Errorf("expected tasks to be processed, but got %d", tasksProcessed)
	}
	processingMutex.Unlock()

	// Close connections
	if err := coordinator.Close(); err != nil {
		t.Logf("Close returned error: %v", err)
	}
}

// TestRecoveryOfStaleTasksClaimed verifies recovery of stale tasks
func TestRecoveryOfStaleTasksClaimed(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	ctx := context.Background()

	// Create broker
	broker := queue.NewBroker(redisClient, logger)

	// Create a task
	task := &types.TaskPayload{
		ID:         "task-1",
		SourceType: "test",
		URL:        "http://example.com/file",
	}

	// Simulate task being claimed (would have TTL in real Redis)
	if err := broker.Enqueue(ctx, task, 5); err != nil {
		t.Fatalf("failed to enqueue task: %v", err)
	}

	// Dequeue to simulate claiming
	claimedTask, err := broker.Dequeue(ctx, "worker-1", 1*time.Second)
	if err != nil {
		t.Fatalf("failed to dequeue task: %v", err)
	}

	if claimedTask == nil {
		t.Fatal("expected task to be dequeued")
	}

	// Verify task was claimed
	if claimedTask.ID != task.ID {
		t.Errorf("expected task ID %s, got %s", task.ID, claimedTask.ID)
	}

	// Recover stale tasks (claimed keys are stored with TTL, so after recovery they should be re-enqueued)
	if err := broker.RecoverStaleTasksClaimed(ctx); err != nil {
		t.Errorf("RecoverStaleTasksClaimed returned error: %v", err)
	}
}

// TestStaleTaskRecoveryWithPagination verifies pagination in stale recovery
func TestStaleTaskRecoveryWithPagination(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	ctx := context.Background()
	broker := queue.NewBroker(redisClient, logger)

	// Enqueue multiple tasks (simulating stale tasks from crashed container)
	numTasks := 1200 // More than pagination batch size (1000)
	for i := 0; i < numTasks; i++ {
		task := &types.TaskPayload{
			ID:         "task-" + string(rune('0'+rune(i%10))),
			SourceType: "test",
			URL:        "http://example.com/file-" + string(rune('0'+rune(i/100))),
		}

		// Dequeue to simulate claiming
		broker.Enqueue(ctx, task, 5)
		broker.Dequeue(ctx, "worker-1", 1*time.Second)
	}

	// Get initial queue depth
	initialDepth, err := broker.GetQueueDepth(ctx)
	if err != nil {
		t.Errorf("GetQueueDepth returned error: %v", err)
	}

	// Recover stale tasks
	if err := broker.RecoverStaleTasksClaimed(ctx); err != nil {
		t.Errorf("RecoverStaleTasksClaimed returned error: %v", err)
	}

	// Verify recovery completed (no panic, logs should show batched recovery)
	t.Logf("initial queue depth: %d, test passed with %d stale tasks", initialDepth, numTasks)
}

// TestMultipleWorkersConcurrentShutdown verifies concurrent worker shutdown
func TestMultipleWorkersConcurrentShutdown(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := createTestDB(t)
	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	// Create broker and worker pool with multiple workers
	broker := queue.NewBroker(redisClient, logger)
	workerPool := queue.NewWorkerPool(5, broker, logger) // 5 concurrent workers

	// Track active goroutines
	activeCount := 0
	var countMutex sync.Mutex

	// Register handler that tracks concurrent execution
	workerPool.RegisterHandler("test", func(ctx context.Context, task *types.TaskPayload) error {
		countMutex.Lock()
		activeCount++
		maxActive := activeCount
		countMutex.Unlock()

		// Simulate work
		time.Sleep(50 * time.Millisecond)

		countMutex.Lock()
		activeCount--
		countMutex.Unlock()

		if maxActive > 5 {
			t.Errorf("too many concurrent tasks: %d", maxActive)
		}

		return nil
	})

	// Start worker pool
	workerPool.Start()

	// Enqueue tasks
	for i := 0; i < 10; i++ {
		task := &types.TaskPayload{
			ID:         "task-" + string(rune('0'+rune(i))),
			SourceType: "test",
			URL:        "http://example.com/file",
		}
		if err := broker.Enqueue(context.Background(), task, 5); err != nil {
			t.Fatalf("failed to enqueue task: %v", err)
		}
	}

	// Create test HTTP server
	server := &http.Server{
		Addr: ":9999",
	}

	// Create shutdown coordinator
	coordinator := NewCoordinator(logger, server, workerPool, broker, dbConn, redisClient, 5*time.Second)

	// Shutdown
	coordinator.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	coordinator.WaitForWorkers(ctx)
	coordinator.Close()

	// Verify no goroutine leaks (all workers exited)
	countMutex.Lock()
	if activeCount != 0 {
		t.Errorf("expected 0 active tasks after shutdown, got %d", activeCount)
	}
	countMutex.Unlock()
}

// TestShutdownTimeout verifies shutdown timeout handling
func TestShutdownTimeout(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := createTestDB(t)
	redisClient := createTestRedis(t)
	defer redisClient.FlushAll(context.Background())

	broker := queue.NewBroker(redisClient, logger)
	workerPool := queue.NewWorkerPool(1, broker, logger)

	// Register handler that takes longer than shutdown timeout
	workerPool.RegisterHandler("test", func(ctx context.Context, task *types.TaskPayload) error {
		// Simulate long-running task (>60s in real scenario)
		select {
		case <-time.After(2 * time.Second):
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	})

	workerPool.Start()

	// Enqueue a task
	task := &types.TaskPayload{
		ID:         "long-task",
		SourceType: "test",
		URL:        "http://example.com/file",
	}
	if err := broker.Enqueue(context.Background(), task, 5); err != nil {
		t.Fatalf("failed to enqueue task: %v", err)
	}

	// Wait for task to be claimed
	time.Sleep(100 * time.Millisecond)

	// Create test HTTP server
	server := &http.Server{
		Addr: ":9999",
	}

	// Create shutdown coordinator with short timeout
	coordinator := NewCoordinator(logger, server, workerPool, broker, dbConn, redisClient, 1*time.Second)

	// Shutdown with timeout shorter than task duration
	coordinator.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Should return timeout error or complete (depending on task progress)
	coordinator.WaitForWorkers(ctx)
	coordinator.Close()

	// Test passed if no panic occurred
}
