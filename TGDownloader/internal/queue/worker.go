package queue

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// WorkerPool manages a pool of workers
type WorkerPool struct {
	workers  int
	broker   *Broker
	logger   *zap.Logger
	wg       sync.WaitGroup
	ctx      context.Context
	cancel   context.CancelFunc
	handlers map[string]TaskHandler
	active   sync.Map // task_id -> worker_id
}

// TaskHandler is a function that processes a task
type TaskHandler func(ctx context.Context, task *types.TaskPayload) error

// NewWorkerPool creates a new worker pool
func NewWorkerPool(numWorkers int, broker *Broker, logger *zap.Logger) *WorkerPool {
	ctx, cancel := context.WithCancel(context.Background())
	return &WorkerPool{
		workers:  numWorkers,
		broker:   broker,
		logger:   logger,
		ctx:      ctx,
		cancel:   cancel,
		handlers: make(map[string]TaskHandler),
		active:   sync.Map{},
	}
}

// RegisterHandler registers a task handler for a source type
func (wp *WorkerPool) RegisterHandler(sourceType string, handler TaskHandler) {
	wp.handlers[sourceType] = handler
}

// Start begins the worker pool
func (wp *WorkerPool) Start() {
	wp.wg.Add(wp.workers)

	for i := 0; i < wp.workers; i++ {
		go wp.runWorker(i)
	}

	wp.logger.Info("worker pool started", zap.Int("workers", wp.workers))
}

// runWorker runs a single worker in the pool
func (wp *WorkerPool) runWorker(id int) {
	defer wp.wg.Done()

	workerID := "worker-" + string(rune('0'+rune(id)))
	ticker := time.NewTicker(5 * time.Second) // Health check interval
	defer ticker.Stop()

	for {
		select {
		case <-wp.ctx.Done():
			wp.logger.Info("worker shutting down", zap.String("worker_id", workerID))
			return

		default:
			// Try to dequeue and process a task
			task, err := wp.broker.Dequeue(wp.ctx, workerID, 5*time.Second)
			if err != nil {
				wp.logger.Error("dequeue error", zap.Error(err), zap.String("worker_id", workerID))
				time.Sleep(100 * time.Millisecond)
				continue
			}

			if task == nil {
				// No task available
				continue
			}

			// Mark as active
			wp.active.Store(task.ID, workerID)

			// Process task
			handler, ok := wp.handlers[string(task.SourceType)]
			if !ok {
				wp.logger.Warn("no handler for source type", zap.String("source", string(task.SourceType)))
				wp.broker.Acknowledge(wp.ctx, task.ID, workerID)
				wp.active.Delete(task.ID)
				continue
			}

			if err := handler(wp.ctx, task); err != nil {
				wp.logger.Error("task processing failed",
					zap.String("task_id", task.ID),
					zap.Error(err),
				)
				// Re-queue for retry
				wp.broker.Requeue(wp.ctx, task, 5)
			} else {
				// Task completed successfully
				wp.broker.Acknowledge(wp.ctx, task.ID, workerID)
				wp.logger.Info("task completed",
					zap.String("task_id", task.ID),
				)
			}

			wp.active.Delete(task.ID)
		}

		// Periodically recover stale tasks
		select {
		case <-ticker.C:
			wp.broker.RecoverStaleTasksClaimed(wp.ctx)
		default:
		}
	}
}

// Shutdown gracefully shuts down the worker pool
func (wp *WorkerPool) Shutdown(timeout time.Duration) error {
	wp.logger.Info("initiating worker pool shutdown",
		zap.Int("active_tasks", wp.GetActiveTaskCount()),
		zap.Duration("timeout", timeout),
	)

	wp.cancel()

	// Wait for all workers to finish with timeout
	done := make(chan struct{})
	go func() {
		wp.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		wp.logger.Info("worker pool shut down gracefully",
			zap.Int("total_workers", wp.workers),
		)
		return nil
	case <-time.After(timeout):
		wp.logger.Warn("worker pool shutdown timeout exceeded",
			zap.Duration("timeout", timeout),
			zap.Int("active_tasks", wp.GetActiveTaskCount()),
		)
		return context.DeadlineExceeded
	}
}

// GetActiveTaskCount returns the number of active tasks
func (wp *WorkerPool) GetActiveTaskCount() int {
	count := 0
	wp.active.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}
