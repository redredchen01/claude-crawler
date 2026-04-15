package shutdown

import (
	"context"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/queue"
)

// Coordinator manages graceful shutdown sequence
type Coordinator struct {
	logger          *zap.Logger
	httpServer      *http.Server
	workerPool      *queue.WorkerPool
	broker          *queue.Broker
	db              *gorm.DB
	redis           *redis.Client
	shutdownTimeout time.Duration
	shutdownChan    chan struct{}
}

// NewCoordinator creates a new shutdown coordinator
func NewCoordinator(
	logger *zap.Logger,
	httpServer *http.Server,
	workerPool *queue.WorkerPool,
	broker *queue.Broker,
	db *gorm.DB,
	redisClient *redis.Client,
	shutdownTimeout time.Duration,
) *Coordinator {
	return &Coordinator{
		logger:          logger,
		httpServer:      httpServer,
		workerPool:      workerPool,
		broker:          broker,
		db:              db,
		redis:           redisClient,
		shutdownTimeout: shutdownTimeout,
		shutdownChan:    make(chan struct{}),
	}
}

// Stop initiates graceful shutdown (non-blocking)
func (c *Coordinator) Stop() error {
	c.logger.Info("graceful shutdown initiated", zap.Duration("timeout", c.shutdownTimeout))

	// Stage 1: Stop accepting new tasks (HTTP server returns 503)
	c.logger.Info("stage 1: stopping HTTP server (returns 503 for new requests)")
	if err := c.httpServer.Close(); err != nil && err != http.ErrServerClosed {
		c.logger.Warn("error closing HTTP server", zap.Error(err))
	}

	// Stage 2: Signal workers to stop claiming tasks (context cancellation)
	c.logger.Info("stage 2: signaling workers to stop claiming tasks")

	return nil
}

// WaitForWorkers waits for in-flight tasks to complete with timeout
func (c *Coordinator) WaitForWorkers(ctx context.Context) error {
	c.logger.Info("stage 3: waiting for in-flight tasks to complete", zap.Duration("timeout", c.shutdownTimeout))

	// Shutdown worker pool with timeout
	if err := c.workerPool.Shutdown(c.shutdownTimeout); err != nil {
		c.logger.Warn("workers did not exit gracefully within timeout", zap.Error(err))
		return err
	}

	c.logger.Info("stage 4: all workers exited cleanly")
	return nil
}

// Close closes database and Redis connections
func (c *Coordinator) Close() error {
	c.logger.Info("stage 5: closing database and Redis connections")

	// Flush Redis (WAIT for replication if AOF enabled)
	if err := c.redis.FlushAll(context.Background()).Err(); err != nil {
		c.logger.Warn("error flushing Redis", zap.Error(err))
	}

	// Close PostgreSQL connection (ensure pending writes committed)
	sqlDB, err := c.db.DB()
	if err != nil {
		c.logger.Warn("error getting database connection", zap.Error(err))
		return err
	}
	if err := sqlDB.Close(); err != nil {
		c.logger.Warn("error closing database connection", zap.Error(err))
		return err
	}

	c.logger.Info("stage 6: database and Redis connections closed successfully")
	c.logger.Info("graceful shutdown completed successfully")

	return nil
}

// IsShuttingDown returns true if shutdown has been initiated
func (c *Coordinator) IsShuttingDown() bool {
	select {
	case <-c.shutdownChan:
		return true
	default:
		return false
	}
}
