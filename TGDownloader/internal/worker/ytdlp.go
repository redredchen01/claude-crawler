package worker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/dedup"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// YtdlpWorker handles yt-dlp downloads
type YtdlpWorker struct {
	db      *gorm.DB
	logger  *zap.Logger
	dedup   *dedup.Manager
	dedupOn bool
}

// NewYtdlpWorker creates a yt-dlp worker
func NewYtdlpWorker(dbConn *gorm.DB, logger *zap.Logger) *YtdlpWorker {
	return &YtdlpWorker{
		db:      dbConn,
		logger:  logger,
		dedupOn: true,
	}
}

// SetDedupManager sets the dedup manager (optional)
func (w *YtdlpWorker) SetDedupManager(dm *dedup.Manager, enabled bool) {
	w.dedup = dm
	w.dedupOn = enabled
}

// Process downloads using yt-dlp
func (w *YtdlpWorker) Process(ctx context.Context, task *types.TaskPayload) error {
	w.logger.Info("starting yt-dlp download",
		zap.String("task_id", task.ID),
		zap.String("url", task.URL),
	)

	// Update status
	w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateDownloading))

	// Run yt-dlp
	outputTemplate := fmt.Sprintf("/data/downloads/%s", task.ID)
	cmd := exec.CommandContext(ctx,
		"yt-dlp",
		"-f", "best[ext=mp4]",
		"-o", outputTemplate,
		task.URL,
	)

	done := make(chan error)
	go func() {
		done <- cmd.Run()
	}()

	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()
	timeoutTimer := time.NewTimer(30 * time.Minute)
	defer timeoutTimer.Stop()

	for {
		select {
		case err := <-done:
			// Command completed (success or error)
			if err != nil {
				w.logger.Error("yt-dlp failed", zap.Error(err))
				w.db.Model(&db.DownloadSession{}).
					Where("session_id = ?", task.ID).
					Updates(map[string]interface{}{
						"status":         string(types.StateFailed),
						"error_message":  err.Error(),
						"error_category": "network",
					})
				return err
			}
			// Success - break out of the loop
			goto yt_dlp_done
		case <-heartbeatTicker.C:
			// Update heartbeat to distinguish active from stale tasks
			if err := w.db.Model(&db.DownloadSession{}).
				Where("session_id = ?", task.ID).
				Update("last_heartbeat", time.Now()).Error; err != nil {
				w.logger.Warn("failed to update heartbeat",
					zap.String("task_id", task.ID),
					zap.Error(err),
				)
			}
		case <-timeoutTimer.C:
			// Timeout reached
			cmd.Cancel()
			w.logger.Warn("yt-dlp timeout")
			w.db.Model(&db.DownloadSession{}).
				Where("session_id = ?", task.ID).
				Update("status", string(types.StateFailed))
			return fmt.Errorf("yt-dlp timeout")
		case <-ctx.Done():
			cmd.Cancel()
			return ctx.Err()
		}
	}

yt_dlp_done:

	_ = w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateProcessing))

	// Compute SHA256 hash of downloaded file
	hash, hashErr := dedup.ComputeHash(outputTemplate)
	if hashErr != nil {
		w.logger.Warn("failed to compute SHA256 hash",
			zap.Error(hashErr),
		)
	} else {
		// Update session with hash
		w.db.Model(&db.DownloadSession{}).
			Where("session_id = ?", task.ID).
			Update("sha256", hash)

		// Check dedup cache if enabled
		if w.dedupOn && w.dedup != nil {
			hit, _, err := w.dedup.CheckOrStore(ctx, task.UserID, string(types.SourceYtdlp), outputTemplate, hash)
			if err != nil {
				w.logger.Warn("dedup check failed, continuing without dedup",
					zap.Error(err),
				)
			} else if hit {
				w.logger.Info("dedup cache hit, file reused",
					zap.String("task_id", task.ID),
					zap.String("sha256", hash[:16]),
				)
			}
		}
	}

	w.logger.Info("yt-dlp download completed",
		zap.String("task_id", task.ID),
		zap.String("sha256", hash[:16]),
	)

	// Extract metadata asynchronously (non-blocking)
	userID := ""
	if task.Metadata != nil {
		if uid, ok := task.Metadata["user_id"].(string); ok {
			userID = uid
		}
	}
	go w.extractMetadataAsync(outputTemplate, task.ID, userID)

	return nil
}

// extractMetadataAsync extracts metadata post-download without blocking
func (w *YtdlpWorker) extractMetadataAsync(filePath string, taskID string, userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// Check if file exists (yt-dlp may have created it with different extension)
	if _, err := os.Stat(filePath); err != nil {
		w.logger.Warn("file not found for metadata extraction",
			zap.String("task_id", taskID),
			zap.String("path", filePath),
			zap.Error(err),
		)
		return
	}

	extractor := NewMetadataExtractor(w.db, w.logger)
	meta, err := extractor.ExtractMetadata(ctx, filePath)
	if err != nil {
		w.logger.Warn("metadata extraction failed",
			zap.String("task_id", taskID),
			zap.Error(err),
		)
		return
	}

	if err := extractor.StoreMetadata(ctx, taskID, userID, filePath, meta); err != nil {
		w.logger.Warn("failed to store metadata in database",
			zap.String("task_id", taskID),
			zap.Error(err),
		)
	}

	// Generate thumbnail if applicable
	if meta != nil && IsVideoOrImageFile(filePath) {
		gen := NewThumbnailGenerator(w.logger, "/tmp")
		thumbPath, err := gen.GenerateThumbnail(ctx, filePath, meta.DurationMs)
		if err != nil {
			w.logger.Warn("thumbnail generation failed",
				zap.String("task_id", taskID),
				zap.Error(err),
			)
		} else if thumbPath != "" {
			// TODO: Upload thumbnail to S3 and update metadata with URL
			w.logger.Info("thumbnail generated",
				zap.String("task_id", taskID),
				zap.String("path", thumbPath),
			)
		}
	}
}
