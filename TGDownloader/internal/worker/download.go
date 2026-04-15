package worker

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/dedup"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
	"github.com/redredchen01/tgdownloader-v2/internal/webhook"
)

// Notifier is an interface for sending download completion notifications
type Notifier interface {
	NotifyCompletion(ctx context.Context, taskID string, userID int64, fileURL string, sizeBytes int64)
}

// DownloadWorker handles HTTP downloads
type DownloadWorker struct {
	db       *gorm.DB
	logger   *zap.Logger
	dedup    *dedup.Manager
	dedupOn  bool
	billing  *billing.Manager
	notifier Notifier // Optional notification interface
}

// NewDownloadWorker creates a download worker
func NewDownloadWorker(dbConn *gorm.DB, logger *zap.Logger) *DownloadWorker {
	return &DownloadWorker{
		db:       dbConn,
		logger:   logger,
		dedupOn:  true,
		billing:  billing.NewManager(dbConn, logger),
	}
}

// SetDedupManager sets the dedup manager (optional)
func (w *DownloadWorker) SetDedupManager(dm *dedup.Manager, enabled bool) {
	w.dedup = dm
	w.dedupOn = enabled
}

// SetNotifier sets the notification manager (optional)
func (w *DownloadWorker) SetNotifier(n Notifier) {
	w.notifier = n
}

// Process downloads a file from HTTP source
func (w *DownloadWorker) Process(ctx context.Context, task *types.TaskPayload) error {
	w.logger.Info("starting download",
		zap.String("task_id", task.ID),
		zap.String("url", task.URL),
	)

	// Update task status
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateDownloading)).Error; err != nil {
		return err
	}

	// Download file with extended timeout for large files (up to 4 hours)
	client := &http.Client{
		Timeout: 4 * time.Hour,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			MaxConnsPerHost:     10,
		},
	}

	w.logger.Info("fetching URL", zap.String("task_id", task.ID), zap.String("url", task.URL))

	// Create request with timeout context
	req, err := http.NewRequestWithContext(ctx, "GET", task.URL, nil)
	if err != nil {
		w.logger.Error("failed to create request", zap.Error(err))
		return err
	}

	// Add necessary headers for compatibility and to mimic real browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0")
	req.Header.Set("Accept", "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "gzip, deflate")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Referer", task.URL)
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := client.Do(req)
	if err != nil {
		w.logger.Error("download failed", zap.Error(err))
		w.db.Model(&db.DownloadSession{}).
			Where("session_id = ?", task.ID).
			Updates(map[string]interface{}{
				"status":         string(types.StateFailed),
				"error_message":  err.Error(),
				"error_category": "network",
			})

		// Refund credits on download failure
		if w.billing != nil && task.UserID > 0 {
			// Get size hint from session to estimate refund amount
			var session db.DownloadSession
			if errSession := w.db.First(&session, "session_id = ?", task.ID).Error; errSession == nil {
				// Conservative estimate: assume at least 1 GB was attempted
				estimatedGB := int64(1)
				if session.TotalSizeBytes > 0 {
					estimatedGB = session.TotalSizeBytes / (1024 * 1024 * 1024)
					if estimatedGB == 0 {
						estimatedGB = 1
					}
				}
				if refundErr := w.billing.RefundCredits(context.Background(), task.UserID, task.ID, estimatedGB); refundErr != nil {
					w.logger.Warn("failed to refund credits on download failure",
						zap.String("task_id", task.ID),
						zap.Int64("user_id", task.UserID),
						zap.Error(refundErr),
					)
				}
			}
		}

		return err
	}
	defer resp.Body.Close()

	// Check for non-2xx responses
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errMsg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		w.logger.Error("download failed with non-success status",
			zap.String("task_id", task.ID),
			zap.Int("status_code", resp.StatusCode),
			zap.String("content_type", resp.Header.Get("Content-Type")),
		)
		w.db.Model(&db.DownloadSession{}).
			Where("session_id = ?", task.ID).
			Updates(map[string]interface{}{
				"status":         string(types.StateFailed),
				"error_message":  errMsg,
				"error_category": "http_error",
			})
		return fmt.Errorf("HTTP error: %d", resp.StatusCode)
	}

	// Validate content type - reject HTML/JSON error responses
	contentType := resp.Header.Get("Content-Type")
	if contentType != "" {
		w.logger.Info("response content type",
			zap.String("task_id", task.ID),
			zap.String("content_type", contentType),
		)

		// Reject HTML/JSON responses (likely error pages)
		if strings.Contains(contentType, "text/html") ||
			strings.Contains(contentType, "application/json") ||
			strings.Contains(contentType, "text/plain") && resp.ContentLength < 1024*100 {
			errMsg := fmt.Sprintf("invalid content type: %s (likely error page)", contentType)
			w.logger.Error("content type validation failed",
				zap.String("task_id", task.ID),
				zap.String("content_type", contentType),
			)
			w.db.Model(&db.DownloadSession{}).
				Where("session_id = ?", task.ID).
				Updates(map[string]interface{}{
					"status":         string(types.StateFailed),
					"error_message":  errMsg,
					"error_category": "invalid_content",
				})
			return fmt.Errorf(errMsg)
		}
	}

	// Compute SHA256 while downloading
	h := sha256.New()
	totalSize := resp.ContentLength
	downloadedSize := int64(0)

	// Write to local file with user_id namespacing for isolation
	downloadDir := os.Getenv("DOWNLOAD_DIR")
	if downloadDir == "" {
		downloadDir = filepath.Join(os.ExpandEnv("$HOME"), "Downloads", "tgdownloader-data", "downloads")
	}
	filePath := filepath.Join(downloadDir, fmt.Sprintf("%d", task.UserID), task.ID, task.ID)
	f, err := createFile(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	// Multi-writer: hash + file
	mw := io.MultiWriter(f, h)

	// Download with progress updates and periodic heartbeat
	// Use 1MB buffer for large video downloads
	buf := make([]byte, 1024*1024)
	heartbeatTicker := time.NewTicker(5 * time.Second)
	defer heartbeatTicker.Stop()
	progressTicker := time.NewTicker(1 * time.Second)
	defer progressTicker.Stop()

DownloadLoop:
	for {
		select {
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

		case <-progressTicker.C:
			// Update progress every 1 second for real-time feedback
			if downloadedSize > 0 {
				w.db.Model(&db.DownloadSession{}).
					Where("session_id = ?", task.ID).
					Updates(map[string]interface{}{
						"file_size_hint":   downloadedSize,
						"total_size_bytes": totalSize,
						"last_heartbeat":   time.Now(),
					})
			}

		case <-ctx.Done():
			return ctx.Err()

		default:
			n, err := resp.Body.Read(buf)
			if n > 0 {
				if _, writeErr := mw.Write(buf[:n]); writeErr != nil {
					w.logger.Error("failed to write data",
						zap.String("task_id", task.ID),
						zap.Error(writeErr),
					)
					return writeErr
				}
				downloadedSize += int64(n)
			}

			if err == io.EOF {
				break DownloadLoop
			}

			if err != nil {
				w.logger.Error("read error during download",
					zap.String("task_id", task.ID),
					zap.Error(err),
				)
				return err
			}

			// Small sleep to prevent busy-waiting
			time.Sleep(1 * time.Millisecond)
		}
	}

	w.logger.Info("download loop completed",
		zap.String("task_id", task.ID),
		zap.Int64("downloaded_bytes", downloadedSize),
		zap.Int64("total_bytes", totalSize),
		zap.Float64("progress_percent", float64(downloadedSize)/float64(totalSize)*100),
	)

	// Update final state with SHA256
	sha256Hash := fmt.Sprintf("%x", h.Sum(nil))
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Updates(map[string]interface{}{
			"status":           string(types.StateProcessing),
			"file_size_hint":   downloadedSize,
			"total_size_bytes": totalSize,
			"sha256":           sha256Hash,
		}).Error; err != nil {
		w.logger.Error("failed to update status to processing",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		return err
	}

	w.logger.Info("download completed",
		zap.String("task_id", task.ID),
		zap.Int64("size", downloadedSize),
		zap.String("sha256", sha256Hash[:16]),
	)

	// Deduct credits after successful download
	// Note: billing failures do not prevent download completion
	if w.billing != nil && task.UserID > 0 {
		// Convert bytes to GB (round up)
		downloadedGB := (downloadedSize + (1024*1024*1024 - 1)) / (1024 * 1024 * 1024)
		if downloadedGB == 0 {
			downloadedGB = 1 // Minimum 1 GB charge
		}

		if err := w.billing.DeductCredits(context.Background(), task.UserID, task.ID, downloadedGB); err != nil {
			w.logger.Warn("billing deduction failed (download still succeeds)",
				zap.String("task_id", task.ID),
				zap.Int64("user_id", task.UserID),
				zap.Int64("downloaded_gb", downloadedGB),
				zap.Error(err),
			)
		} else {
			w.logger.Info("credits deducted",
				zap.String("task_id", task.ID),
				zap.Int64("user_id", task.UserID),
				zap.Int64("downloaded_gb", downloadedGB),
			)
		}
	}

	// Check dedup cache if enabled (user-scoped for isolation)
	if w.dedupOn && w.dedup != nil {
		hit, _, err := w.dedup.CheckOrStore(ctx, task.UserID, string(types.SourceHTTP), filePath, sha256Hash)
		if err != nil {
			w.logger.Warn("dedup check failed, continuing without dedup",
				zap.Error(err),
			)
		} else if hit {
			w.logger.Info("dedup cache hit, file reused",
				zap.String("task_id", task.ID),
				zap.Int64("user_id", task.UserID),
				zap.String("sha256", sha256Hash[:16]),
			)
		}
	}

	// Extract metadata asynchronously (non-blocking)
	// Extract user_id from task metadata if available (Phase 3 context)
	userID := ""
	if task.Metadata != nil {
		if uid, ok := task.Metadata["user_id"].(string); ok {
			userID = uid
		}
	}
	go w.extractMetadataAsync(filePath, task.ID, userID)

	// Trigger webhook notifications asynchronously (non-blocking)
	// Webhooks are optional; failure does not affect download completion
	go w.triggerWebhooksAsync(ctx, task.ID, task.UserID)

	// Mark task as done
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateDone)).Error; err != nil {
		w.logger.Error("failed to mark task as done",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
	}

	// Send completion notifications asynchronously (non-blocking)
	if w.notifier != nil {
		go w.notifier.NotifyCompletion(context.Background(), task.ID, task.UserID, task.URL, downloadedSize)
	}

	return nil
}

// extractMetadataAsync extracts metadata post-download without blocking
func (w *DownloadWorker) extractMetadataAsync(filePath string, taskID string, userID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

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

func createFile(path string) (io.WriteCloser, error) {
	// Create parent directories
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	// Create and open file
	f, err := os.Create(path)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	return f, nil
}

// triggerWebhooksAsync creates webhook delivery tasks for all user's webhooks
// Runs asynchronously; failures do not block download completion
func (w *DownloadWorker) triggerWebhooksAsync(ctx context.Context, taskID string, userID int64) {
	mgr := webhook.NewManager(w.db, w.logger)

	// Find all active webhooks for user
	var webhooks []db.Webhook
	if err := w.db.
		Where("user_id = ? AND active = true AND deleted_at IS NULL", userID).
		Find(&webhooks).Error; err != nil {
		w.logger.Warn("failed to fetch webhooks for task",
			zap.String("task_id", taskID),
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return
	}

	if len(webhooks) == 0 {
		w.logger.Debug("no active webhooks for user",
			zap.Int64("user_id", userID),
		)
		return
	}

	// Create delivery task for each webhook
	for _, wh := range webhooks {
		payload := map[string]interface{}{
			"task_id": taskID,
			"user_id": userID,
		}

		if err := mgr.CreateDeliveryTask(ctx, userID, taskID, wh.URL, wh.Secret, payload); err != nil {
			w.logger.Warn("failed to create webhook delivery task",
				zap.String("task_id", taskID),
				zap.Int64("webhook_id", wh.ID),
				zap.Error(err),
			)
		}
	}

	w.logger.Info("webhook delivery tasks created",
		zap.String("task_id", taskID),
		zap.Int("webhook_count", len(webhooks)),
	)
}
