package worker

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/dedup"
	"github.com/redredchen01/tgdownloader-v2/internal/tdlib"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// TDLibClientWrapper wraps TDLib client with goroutine-safe operations
type TDLibClientWrapper struct {
	mu           sync.RWMutex
	logger       *zap.Logger
	cfg          *config.TDLibConfig
	sessionMgr   *tdlib.SessionManager
	// Note: Real TDLib client would be initialized here
	// client *tdlib.Client
	ready bool
}

// NewTDLibClientWrapper creates a TDLib client wrapper
func NewTDLibClientWrapper(cfg *config.TDLibConfig, logger *zap.Logger, dbConn *gorm.DB) (*TDLibClientWrapper, error) {
	if !cfg.Enabled {
		logger.Warn("TDLib is disabled")
		return &TDLibClientWrapper{
			logger: logger,
			cfg:    cfg,
			ready:  false,
		}, nil
	}

	// Initialize session manager for per-user credentials
	sessionMgr, err := tdlib.NewSessionManager(dbConn)
	if err != nil {
		logger.Warn("Failed to initialize session manager, will fallback to shared config", zap.Error(err))
	}

	wrapper := &TDLibClientWrapper{
		logger:     logger,
		cfg:        cfg,
		sessionMgr: sessionMgr,
		ready:      false,
	}

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		logger.Error("TDLib config validation failed", zap.Error(err))
		return wrapper, err
	}

	// TODO: Initialize actual TDLib client here
	// This is where we would call:
	// client := tdlib.NewClient(tdlib.Config{
	// 	APIID:      cfg.APIKey,
	// 	APIHash:    cfg.APIHash,
	// 	SystemLanguageCode: "en",
	// 	DatabaseDirectory: cfg.SessionPath,
	// 	// ...
	// })
	// And verify session with GetMe()

	logger.Info("TDLib client wrapper initialized (stub mode)")
	return wrapper, nil
}

// IsReady returns whether TDLib client is ready
func (w *TDLibClientWrapper) IsReady() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.ready
}

// GetUserCredentials fetches user-specific TDLib credentials
// If session manager is available, returns user-specific creds; otherwise falls back to shared config
func (w *TDLibClientWrapper) GetUserCredentials(userID int64) (apiID, apiHash, phone string, err error) {
	// Try to fetch user-specific session if session manager is available
	if w.sessionMgr != nil {
		creds, err := w.sessionMgr.GetUserSession(userID)
		if err == nil {
			return creds.APIID, creds.APIHash, creds.Phone, nil
		}
		// If user has no session, fall back to shared config (with warning)
		w.logger.Warn("no user-specific TDLib session found, falling back to shared config",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
	}

	// Fallback to shared config from environment
	if w.cfg.APIKey == "" || w.cfg.APIHash == "" {
		return "", "", "", fmt.Errorf("no user-specific session and shared TDLib config not available")
	}

	return w.cfg.APIKey, w.cfg.APIHash, w.cfg.Phone, nil
}

// TDLibWorker handles Telegram downloads via TDLib
type TDLibWorker struct {
	db           *gorm.DB
	logger       *zap.Logger
	dedup        *dedup.Manager
	dedupOn      bool
	client       *TDLibClientWrapper
	downloadDir  string
}

// NewTDLibWorker creates a TDLib worker
func NewTDLibWorker(
	dbConn *gorm.DB,
	logger *zap.Logger,
	tdlibCfg *config.TDLibConfig,
	downloadDir string,
) (*TDLibWorker, error) {
	client, err := NewTDLibClientWrapper(tdlibCfg, logger, dbConn)
	if err != nil && tdlibCfg.Enabled {
		logger.Error("failed to initialize TDLib client", zap.Error(err))
		return nil, err
	}

	return &TDLibWorker{
		db:          dbConn,
		logger:      logger,
		client:      client,
		dedupOn:     true,
		downloadDir: downloadDir,
	}, nil
}

// SetDedupManager sets the dedup manager
func (w *TDLibWorker) SetDedupManager(dm *dedup.Manager, enabled bool) {
	w.dedup = dm
	w.dedupOn = enabled
}

// Process handles TDLib download task
func (w *TDLibWorker) Process(ctx context.Context, task *types.TaskPayload) error {
	if !w.client.IsReady() {
		return fmt.Errorf("TDLib client not ready")
	}

	w.logger.Info("starting TDLib download",
		zap.String("task_id", task.ID),
		zap.Any("metadata", task.Metadata),
	)

	// Update task status to downloading
	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", task.ID).
		Update("status", string(types.StateDownloading)).Error; err != nil {
		return fmt.Errorf("failed to update task status: %w", err)
	}

	// Extract metadata
	chatID, messageID := extractTDLibMetadata(task.Metadata)
	if chatID == "" || messageID == "" {
		return fmt.Errorf("missing chat_id or message_id in metadata")
	}

	// Start periodic heartbeat updates (every 10s to distinguish active from stale tasks)
	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()

	go func() {
		for range heartbeatTicker.C {
			if err := w.db.Model(&db.DownloadSession{}).
				Where("session_id = ?", task.ID).
				Update("last_heartbeat", time.Now()).Error; err != nil {
				w.logger.Warn("failed to update heartbeat",
					zap.String("task_id", task.ID),
					zap.Error(err),
				)
			}
		}
	}()

	// Load session metadata for incremental sync
	sessionMeta, err := w.loadSessionMetadata(ctx, task.ID)
	if err != nil {
		w.logger.Warn("failed to load session metadata", zap.Error(err))
		sessionMeta = make(map[string]interface{})
	}

	// Fetch channel history
	messages, err := w.fetchChannelHistory(ctx, chatID, messageID, task.ID, sessionMeta)
	if err != nil {
		return w.handleTDLibError(ctx, task.ID, err)
	}

	if len(messages) == 0 {
		w.logger.Info("no new messages to download",
			zap.String("task_id", task.ID),
		)
		return w.completeTask(ctx, task.ID)
	}

	w.logger.Info("fetched messages from Telegram",
		zap.String("task_id", task.ID),
		zap.Int("message_count", len(messages)),
	)

	// Update session metadata with last_message_id
	if len(messages) > 0 {
		sessionMeta["last_message_id"] = messages[len(messages)-1]
		sessionMeta["synced_at"] = time.Now().Format(time.RFC3339)
		if err := w.saveSessionMetadata(ctx, task.ID, sessionMeta); err != nil {
			w.logger.Warn("failed to save session metadata", zap.Error(err))
		}
	}

	// Mark task as done (message list enqueued separately in real implementation)
	return w.completeTask(ctx, task.ID)
}

// fetchChannelHistory fetches messages from a Telegram channel
func (w *TDLibWorker) fetchChannelHistory(
	ctx context.Context,
	chatID string,
	messageID string,
	taskID string,
	sessionMeta map[string]interface{},
) ([]int, error) {
	// TODO: Real implementation would call TDLib GetChannelHistory
	// For now, return stub implementation

	w.logger.Debug("fetching channel history",
		zap.String("chat_id", chatID),
		zap.String("message_id", messageID),
	)

	// Check if this is a resumption
	lastMessageIDRaw, exists := sessionMeta["last_message_id"]
	if exists {
		w.logger.Info("resuming incremental sync",
			zap.String("task_id", taskID),
			zap.Any("last_message_id", lastMessageIDRaw),
		)
	}

	// Stub: return empty message list for now
	return []int{}, nil
}

// downloadTelegramFile downloads a file via TDLib
// Note: This is a stub; real implementation uses TDLib downloadFile API
func (w *TDLibWorker) downloadTelegramFile(
	ctx context.Context,
	taskID string,
	fileID string,
) (string, error) {
	// TODO: Real implementation
	// 1. Call TDLib downloadFile(fileID) with offset/limit tracking
	// 2. Update ChunkProgress table with offsets
	// 3. Compute SHA256 hash
	// 4. Return file path

	filePath := filepath.Join(w.downloadDir, taskID+".tmp")
	return filePath, nil
}

// extractTDLibMetadata extracts chat_id and message_id from task metadata
func extractTDLibMetadata(metadata map[string]interface{}) (string, string) {
	var chatID, messageID string

	if val, ok := metadata["chat_id"]; ok {
		chatID = fmt.Sprintf("%v", val)
	}
	if val, ok := metadata["message_id"]; ok {
		messageID = fmt.Sprintf("%v", val)
	}

	return chatID, messageID
}

// loadSessionMetadata loads incremental sync metadata from database
func (w *TDLibWorker) loadSessionMetadata(
	ctx context.Context,
	taskID string,
) (map[string]interface{}, error) {
	var session db.DownloadSession
	result := w.db.WithContext(ctx).
		Where("session_id = ?", taskID).
		First(&session)

	if result.Error != nil {
		return nil, result.Error
	}

	// Session metadata stored as JSONB in a nullable field
	// For now, return empty map; real implementation would parse JSONB
	return make(map[string]interface{}), nil
}

// saveSessionMetadata saves incremental sync metadata to database
func (w *TDLibWorker) saveSessionMetadata(
	ctx context.Context,
	taskID string,
	metadata map[string]interface{},
) error {
	// TODO: Store metadata as JSONB in database
	// This requires adding a metadata JSONB field to DownloadSession
	w.logger.Debug("saving session metadata",
		zap.String("task_id", taskID),
		zap.Any("metadata", metadata),
	)
	return nil
}

// handleTDLibError categorizes and handles TDLib errors
func (w *TDLibWorker) handleTDLibError(
	ctx context.Context,
	taskID string,
	err error,
) error {
	errorMsg := err.Error()
	errorCategory := "tdlib_error"

	// Categorize error as transient or permanent
	isTransient := false
	if contains(errorMsg, "429") {
		isTransient = true
		errorCategory = "tdlib_error:rate_limit"
	} else if contains(errorMsg, "500") {
		isTransient = true
		errorCategory = "tdlib_error:server_error"
	} else if contains(errorMsg, "timeout") {
		isTransient = true
		errorCategory = "tdlib_error:timeout"
	} else if contains(errorMsg, "400") {
		errorCategory = "tdlib_error:bad_request"
	} else if contains(errorMsg, "401") {
		errorCategory = "tdlib_error:not_authorized"
	} else if contains(errorMsg, "403") {
		errorCategory = "tdlib_error:not_member"
	} else if contains(errorMsg, "404") {
		errorCategory = "tdlib_error:not_found"
	}

	w.logger.Error("TDLib error",
		zap.String("task_id", taskID),
		zap.String("category", errorCategory),
		zap.Error(err),
	)

	if err := w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":         string(types.StateFailed),
			"error_message":  errorMsg,
			"error_category": errorCategory,
		}).Error; err != nil {
		w.logger.Error("failed to update error status", zap.Error(err))
	}

	if isTransient {
		// Return error so task can be retried
		return fmt.Errorf("%s (transient): %w", errorCategory, err)
	}

	// Permanent error - task will not be retried
	return fmt.Errorf("%s (permanent): %w", errorCategory, err)
}

// completeTask marks a task as done
func (w *TDLibWorker) completeTask(ctx context.Context, taskID string) error {
	now := time.Now()
	return w.db.Model(&db.DownloadSession{}).
		Where("session_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":       string(types.StateDone),
			"completed_at": now,
		}).Error
}

// contains is a helper function that checks if string s contains substring
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

// StartHeartbeat starts a background goroutine that periodically checks client health
func (w *TDLibWorker) StartHeartbeat(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("TDLib heartbeat stopped")
				return
			case <-ticker.C:
				// TODO: Call TDLib GetMe() to verify client is alive
				// If error, log CRITICAL alert
				w.logger.Debug("TDLib heartbeat check")
			}
		}
	}()
}
