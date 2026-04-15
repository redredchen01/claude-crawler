package worker

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/dedup"
	"github.com/redredchen01/tgdownloader-v2/internal/tdlib"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// TelegramDownloadWorker handles Telegram file downloads
type TelegramDownloadWorker struct {
	db             *gorm.DB
	logger         *zap.Logger
	sessionManager *tdlib.SessionManager
	dedup          *dedup.Manager
	dedupOn        bool
	notifier       Notifier // Optional notification interface
}

// NewTelegramDownloadWorker creates a new Telegram download worker
func NewTelegramDownloadWorker(dbConn *gorm.DB, logger *zap.Logger) *TelegramDownloadWorker {
	var sessionMgr *tdlib.SessionManager
	// Try to create session manager for credential decryption
	if mgr, err := tdlib.NewSessionManager(dbConn); err == nil {
		sessionMgr = mgr
	}

	return &TelegramDownloadWorker{
		db:             dbConn,
		logger:         logger,
		sessionManager: sessionMgr,
	}
}

// SetDedupManager sets the dedup manager (optional)
func (w *TelegramDownloadWorker) SetDedupManager(dm *dedup.Manager, enabled bool) {
	w.dedup = dm
	w.dedupOn = enabled
}

// SetNotifier sets the notification manager (optional)
func (w *TelegramDownloadWorker) SetNotifier(n Notifier) {
	w.notifier = n
}

// Process downloads a file from Telegram
func (w *TelegramDownloadWorker) Process(ctx context.Context, task *types.TaskPayload) error {
	w.logger.Info("starting telegram download",
		zap.String("task_id", task.ID),
		zap.Int64("user_id", task.UserID),
	)

	// Update task status to processing
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateProcessing)).Error; err != nil {
		w.logger.Error("failed to update status",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		return err
	}

	// Extract metadata from task
	var chatID, messageID string
	if task.Metadata != nil {
		if cid, ok := task.Metadata["chat_id"].(string); ok {
			chatID = cid
		}
		if mid, ok := task.Metadata["message_id"].(string); ok {
			messageID = mid
		}
	}

	if chatID == "" || messageID == "" {
		errMsg := "missing chat_id or message_id in task metadata"
		w.logger.Error(errMsg, zap.String("task_id", task.ID))
		w.updateTaskFailed(task.ID, errMsg, "invalid_metadata")
		return fmt.Errorf(errMsg)
	}

	w.logger.Info("extracted telegram message info",
		zap.String("task_id", task.ID),
		zap.String("chat_id", chatID),
		zap.String("message_id", messageID),
	)

	// Try real Telegram download using Python Telethon
	filePath, err := w.downloadFromTelegram(task.UserID, task.ID, chatID, messageID)
	if err != nil {
		w.logger.Error("real telegram download failed",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		w.updateTaskFailed(task.ID, err.Error(), "download_failed")
		return err
	}

	// Compute SHA256
	sha256Hash, err := w.computeSHA256(filePath)
	if err != nil {
		w.logger.Error("failed to compute hash",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		w.updateTaskFailed(task.ID, err.Error(), "hash_failed")
		return err
	}

	// Update task status to done
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		w.logger.Error("failed to get file info",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		return err
	}

	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Updates(map[string]interface{}{
			"status":           string(types.StateDone),
			"file_size_hint":   fileInfo.Size(),
			"total_size_bytes": fileInfo.Size(),
			"sha256":           sha256Hash,
		}).Error; err != nil {
		w.logger.Error("failed to update status to done",
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		return err
	}

	w.logger.Info("telegram download completed",
		zap.String("task_id", task.ID),
		zap.Int64("size", fileInfo.Size()),
		zap.String("sha256", sha256Hash[:16]),
	)

	// Check dedup cache if enabled (user-scoped for isolation)
	if w.dedupOn && w.dedup != nil {
		cacheKey := fmt.Sprintf("tg:%s:%s", chatID, messageID)
		hit, _, err := w.dedup.CheckOrStore(context.Background(), task.UserID, cacheKey, filePath, sha256Hash)
		if err != nil {
			w.logger.Warn("dedup check failed, continuing without dedup",
				zap.Error(err),
			)
		} else if hit {
			w.logger.Info("dedup cache hit, file reused",
				zap.String("task_id", task.ID),
				zap.Int64("user_id", task.UserID),
				zap.String("cache_key", cacheKey),
				zap.String("sha256", sha256Hash[:16]),
			)
		}
	}

	// Send completion notifications asynchronously (non-blocking)
	if w.notifier != nil {
		go w.notifier.NotifyCompletion(context.Background(), task.ID, task.UserID, task.URL, fileInfo.Size())
	}

	return nil
}

// downloadFromTelegram downloads a video from Telegram using Python Telethon
func (w *TelegramDownloadWorker) downloadFromTelegram(userID int64, taskID string, chatID string, messageID string) (string, error) {
	// Use global Telegram credentials from environment (dev mode)
	// These are shared for all users for now
	apiID := os.Getenv("TELEGRAM_API_ID")
	apiHash := os.Getenv("TELEGRAM_API_HASH")
	phone := os.Getenv("TELEGRAM_PHONE")

	if apiID == "" || apiHash == "" {
		return "", fmt.Errorf("telegram credentials not configured")
	}
	if phone == "" {
		return "", fmt.Errorf("TELEGRAM_PHONE environment variable not set")
	}

	w.logger.Debug("using telegram credentials",
		zap.String("phone", maskPhone(phone)),
		zap.String("api_id", apiID),
	)

	// Prepare output file path
	downloadDir := os.Getenv("DOWNLOAD_DIR")
	if downloadDir == "" {
		downloadDir = filepath.Join(os.ExpandEnv("$HOME"), "Downloads", "tgdownloader-data", "downloads")
	}
	filePath := filepath.Join(downloadDir, fmt.Sprintf("%d", userID), taskID, taskID+".mp4")

	// Create parent directories
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	w.logger.Info("downloading from telegram",
		zap.String("task_id", taskID),
		zap.String("chat_id", chatID),
		zap.String("message_id", messageID),
		zap.String("phone", maskPhone(phone)),
	)

	// Call Python script to download video using Telethon
	scriptPath := filepath.Join(os.Getenv("PWD"), "scripts", "download_tg_video.py")
	if _, err := os.Stat(scriptPath); err != nil {
		// Try alternate path
		scriptPath = "/Users/dex/YD 2026/TGDownloader/scripts/download_tg_video.py"
	}

	cmd := exec.Command("python3", scriptPath,
		chatID,
		messageID,
		phone,
		apiID,
		apiHash,
		filePath,
	)

	var stderr, stdout bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = &stdout

	w.logger.Debug("executing python download script",
		zap.String("script", scriptPath),
		zap.String("task_id", taskID),
	)

	// Start file-size polling goroutine for real-time speed display
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				if fi, err := os.Stat(filePath); err == nil && fi.Size() > 0 {
					// Update file_size_hint in database for progress reporting
					w.db.Model(&db.DownloadSession{}).
						Where("session_id = ?", taskID).
						Updates(map[string]interface{}{
							"file_size_hint": fi.Size(),
							"last_heartbeat": time.Now(),
						})
				}
			}
		}
	}()

	// Retry logic with exponential backoff
	const maxAttempts = 3
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		// Calculate resume offset if file was partially downloaded
		var resumeOffset int64
		if fi, err := os.Stat(filePath); err == nil {
			resumeOffset = fi.Size()
		}

		// Rebuild command with resume offset as 7th argument
		cmd := exec.Command("python3", scriptPath,
			chatID,
			messageID,
			phone,
			apiID,
			apiHash,
			filePath,
			fmt.Sprintf("%d", resumeOffset),
		)
		cmd.Stderr = &stderr
		cmd.Stdout = &stdout

		lastErr = cmd.Run()
		if lastErr == nil {
			break // Success
		}

		// Log attempt failure
		if attempt < maxAttempts {
			delay := time.Duration(3) * time.Duration(1<<uint(attempt)) * time.Second // 6s, 12s
			w.logger.Warn("telegram download attempt failed, retrying",
				zap.String("task_id", taskID),
				zap.Int("attempt", attempt),
				zap.Int("max_attempts", maxAttempts),
				zap.Duration("retry_delay", delay),
				zap.Error(lastErr),
			)
			time.Sleep(delay)
		}
	}

	close(done)

	if lastErr != nil {
		stderrMsg := stderr.String()
		w.logger.Error("telegram download failed after retries",
			zap.String("task_id", taskID),
			zap.Int("attempts", maxAttempts),
			zap.Error(lastErr),
			zap.String("stderr", stderrMsg),
		)
		return "", fmt.Errorf("download script failed after %d attempts: %w", maxAttempts, lastErr)
	}

	// Log successful download
	w.logger.Info("telegram download succeeded",
		zap.String("task_id", taskID),
	)

	// Verify file was created
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return "", fmt.Errorf("downloaded file not found: %w", err)
	}

	fileSize := fileInfo.Size()
	if fileSize < 10000 { // At least 10KB
		return "", fmt.Errorf("downloaded file too small (%d bytes)", fileSize)
	}

	w.logger.Info("telegram video downloaded successfully",
		zap.String("task_id", taskID),
		zap.Int64("size_bytes", fileSize),
		zap.String("file_path", filePath),
	)

	return filePath, nil
}

// maskPhone masks phone number for logging
func maskPhone(phone string) string {
	if len(phone) < 6 {
		return "***"
	}
	return phone[:3] + "****" + phone[len(phone)-2:]
}


// computeSHA256 computes the SHA256 hash of a file
func (w *TelegramDownloadWorker) computeSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// updateTaskFailed updates task status to failed
func (w *TelegramDownloadWorker) updateTaskFailed(taskID string, errorMsg string, errorCategory string) {
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":          string(types.StateFailed),
			"error_message":   errorMsg,
			"error_category":  errorCategory,
			"last_heartbeat":  time.Now(),
		}).Error; err != nil {
		w.logger.Warn("failed to update task status to failed",
			zap.String("task_id", taskID),
			zap.Error(err),
		)
	}
}
