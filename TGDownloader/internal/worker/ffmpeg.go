package worker

import (
	"context"
	"fmt"
	"os/exec"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// FFmpegWorker handles video transcoding
type FFmpegWorker struct {
	db      *gorm.DB
	logger  *zap.Logger
	maxProc int
}

// NewFFmpegWorker creates an FFmpeg worker
func NewFFmpegWorker(dbConn *gorm.DB, logger *zap.Logger, maxProcs int) *FFmpegWorker {
	return &FFmpegWorker{
		db:      dbConn,
		logger:  logger,
		maxProc: maxProcs,
	}
}

// Process transcodes a video file
func (w *FFmpegWorker) Process(ctx context.Context, task *types.TaskPayload) error {
	w.logger.Info("starting FFmpeg transcode",
		zap.String("task_id", task.ID),
	)

	// Update status
	w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateProcessing))

	// FFmpeg command (simplified)
	inputPath := fmt.Sprintf("/data/downloads/%s", task.ID)
	outputPath := fmt.Sprintf("/data/transcoded/%s.mp4", task.ID)

	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-i", inputPath,
		"-c:v", "libx264",
		"-preset", "medium",
		"-crf", "23",
		"-c:a", "aac",
		"-b:a", "128k",
		"-y", // Overwrite
		outputPath,
	)

	// Run with timeout
	done := make(chan error)
	go func() {
		done <- cmd.Run()
	}()

	select {
	case err := <-done:
		if err != nil {
			w.logger.Error("FFmpeg failed", zap.Error(err))
			w.db.Model(&db.DownloadSession{}).
				Where("session_id = ?", task.ID).
				Updates(map[string]interface{}{
					"status":         string(types.StateFailed),
					"error_message":  err.Error(),
					"error_category": "content_error",
				})
			return err
		}
	case <-time.After(1 * time.Hour):
		cmd.Cancel()
		w.logger.Warn("FFmpeg timeout")
		w.db.Model(&db.DownloadSession{}).
			Where("session_id = ?", task.ID).
			Update("status", string(types.StateFailed))
		return fmt.Errorf("ffmpeg timeout")
	}

	// Update to ready for upload
	w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateUploading))

	w.logger.Info("FFmpeg transcode completed",
		zap.String("task_id", task.ID),
	)

	return nil
}
