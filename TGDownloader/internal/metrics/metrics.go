package metrics

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// Collector collects metrics from Redis and PostgreSQL
type Collector struct {
	db     *gorm.DB
	redis  *redis.Client
	logger *zap.Logger
}

// Metrics represents aggregated system metrics
type Metrics struct {
	QueueDepth          int64                `json:"queue_depth"`
	QueueByPriority     map[string]int64     `json:"queue_by_priority"`
	PendingCount        int64                `json:"pending_count"`
	ProcessingCount     int64                `json:"processing_count"`
	FailedCount         int64                `json:"failed_count"`
	ErrorRate7d         float64              `json:"error_rate_7d"`
	AvgTranscodeTime7d  float64              `json:"avg_transcode_time_7d"`
	Timestamp           int64                `json:"timestamp"`
}

// ErrorRecord represents a single error entry
type ErrorRecord struct {
	Timestamp    string `json:"timestamp"`
	SourceType   string `json:"source_type"`
	ErrorMessage string `json:"error_message"`
	SessionID    string `json:"session_id"`
}

// NewCollector creates a new metrics collector
func NewCollector(dbConn *gorm.DB, redisClient *redis.Client, logger *zap.Logger) *Collector {
	return &Collector{
		db:     dbConn,
		redis:  redisClient,
		logger: logger,
	}
}

// Collect gathers all metrics from Redis and PostgreSQL
func (c *Collector) Collect(ctx context.Context) (*Metrics, error) {
	m := &Metrics{
		QueueByPriority: make(map[string]int64),
		Timestamp:       time.Now().Unix(),
	}

	// Get queue depth by priority
	for _, priority := range []string{"10", "5", "1"} {
		queueKey := "queue:" + priority
		count, err := c.redis.ZCard(ctx, queueKey).Result()
		if err != nil && err != redis.Nil {
			c.logger.Warn("failed to get queue depth", zap.String("priority", priority), zap.Error(err))
			continue
		}
		m.QueueByPriority[priority] = count
		m.QueueDepth += count
	}

	// Get session counts by status
	if err := c.collectSessionCounts(ctx, m); err != nil {
		c.logger.Warn("failed to collect session counts", zap.Error(err))
	}

	// Get 7-day error rate and avg transcode time
	if err := c.collect7dayMetrics(ctx, m); err != nil {
		c.logger.Warn("failed to collect 7-day metrics", zap.Error(err))
	}

	return m, nil
}

// collectSessionCounts queries database for session status counts
func (c *Collector) collectSessionCounts(ctx context.Context, m *Metrics) error {
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)

	var pending, processing, failed int64

	// Count pending sessions
	if err := c.db.WithContext(ctx).
		Model(&db.DownloadSession{}).
		Where("status = ? AND created_at > ?", "pending", sevenDaysAgo).
		Count(&pending).Error; err != nil {
		return err
	}

	// Count processing sessions
	if err := c.db.WithContext(ctx).
		Model(&db.DownloadSession{}).
		Where("status = ? AND created_at > ?", "processing", sevenDaysAgo).
		Count(&processing).Error; err != nil {
		return err
	}

	// Count failed sessions
	if err := c.db.WithContext(ctx).
		Model(&db.DownloadSession{}).
		Where("status = ? AND created_at > ?", "failed", sevenDaysAgo).
		Count(&failed).Error; err != nil {
		return err
	}

	m.PendingCount = pending
	m.ProcessingCount = processing
	m.FailedCount = failed

	return nil
}

// collect7dayMetrics calculates error rate and avg transcode time for last 7 days
func (c *Collector) collect7dayMetrics(ctx context.Context, m *Metrics) error {
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)

	// Count total downloads in 7 days
	var totalCount int64
	if err := c.db.WithContext(ctx).
		Model(&db.DownloadSession{}).
		Where("created_at > ?", sevenDaysAgo).
		Count(&totalCount).Error; err != nil {
		return err
	}

	// Error rate: failed_count / total_count
	if totalCount > 0 {
		m.ErrorRate7d = float64(m.FailedCount) / float64(totalCount)
	}

	// Average transcode time: mean of (completed_at - created_at) for done/completed tasks
	var sessions []db.DownloadSession
	if err := c.db.WithContext(ctx).
		Where("status = ? AND completed_at IS NOT NULL AND created_at > ?", "done", sevenDaysAgo).
		Select("created_at", "completed_at").
		Find(&sessions).Error; err != nil {
		return err
	}

	if len(sessions) > 0 {
		var totalDuration int64
		for _, session := range sessions {
			if session.CompletedAt != nil {
				duration := session.CompletedAt.Sub(session.CreatedAt).Seconds()
				totalDuration += int64(duration)
			}
		}
		m.AvgTranscodeTime7d = float64(totalDuration) / float64(len(sessions))
	}

	return nil
}

// GetErrors returns the last N error records
func (c *Collector) GetErrors(ctx context.Context, limit int) ([]ErrorRecord, error) {
	var sessions []db.DownloadSession
	if err := c.db.WithContext(ctx).
		Where("status = ? AND error_message IS NOT NULL", "failed").
		Order("created_at DESC").
		Limit(limit).
		Find(&sessions).Error; err != nil {
		return nil, err
	}

	errors := make([]ErrorRecord, 0, len(sessions))
	for _, session := range sessions {
		errors = append(errors, ErrorRecord{
			Timestamp:    session.CreatedAt.Format(time.RFC3339),
			SourceType:   session.SourceType,
			ErrorMessage: session.ErrorMessage,
			SessionID:    session.SessionID,
		})
	}

	return errors, nil
}
