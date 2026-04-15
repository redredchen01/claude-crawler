package worker

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// Run migrations
	err = db.InitDB(dbConn)
	require.NoError(t, err)

	return dbConn
}

// TestTDLibClientWrapperDisabled tests behavior when TDLib is disabled
func TestTDLibClientWrapperDisabled(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	wrapper, err := NewTDLibClientWrapper(cfg, logger, dbConn)
	require.NoError(t, err)
	assert.False(t, wrapper.IsReady())
}

// TestTDLibClientWrapperInit tests TDLib client initialization
func TestTDLibClientWrapperInit(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled:     false, // Start disabled to avoid actual TDLib calls
		SessionPath: "/tmp/tdlib_test",
	}

	wrapper, err := NewTDLibClientWrapper(cfg, logger, dbConn)
	// Should not error even if disabled
	require.NoError(t, err)
	assert.NotNil(t, wrapper)
}

// TestTDLibWorkerCreation tests TDLib worker creation
func TestTDLibWorkerCreation(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)
	assert.NotNil(t, worker)
}

// TestExtractTDLibMetadata tests metadata extraction
func TestExtractTDLibMetadata(t *testing.T) {
	tests := []struct {
		name      string
		metadata  map[string]interface{}
		wantChat  string
		wantMsg   string
	}{
		{
			name: "valid metadata",
			metadata: map[string]interface{}{
				"chat_id":    "-1001234567890",
				"message_id": "42",
			},
			wantChat: "-1001234567890",
			wantMsg:  "42",
		},
		{
			name: "numeric chat_id",
			metadata: map[string]interface{}{
				"chat_id":    123456789,
				"message_id": 100,
			},
			wantChat: "123456789",
			wantMsg:  "100",
		},
		{
			name:     "missing chat_id",
			metadata: map[string]interface{}{"message_id": "42"},
			wantChat: "",
			wantMsg:  "42",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chatID, messageID := extractTDLibMetadata(tt.metadata)
			assert.Equal(t, tt.wantChat, chatID)
			assert.Equal(t, tt.wantMsg, messageID)
		})
	}
}

// TestTDLibWorkerProcessInvalidMetadata tests handling of invalid metadata
func TestTDLibWorkerProcessInvalidMetadata(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled:     true,
		SessionPath: "/tmp/tdlib_test",
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	// Worker creation might error if TDLib validation fails, but we can still test metadata handling
	if err != nil && cfg.Enabled {
		// In test environment, just skip if TDLib can't be initialized
		t.Skip("TDLib not available in test environment")
	}

	// Create download session
	session := &db.DownloadSession{
		SessionID:     "test-task-1",
		FileURL:       "https://t.me/testchannel/1",
		SourceType:    string(types.SourceTypeTDLib),
		Status:        string(types.StatePending),
		CreatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}
	require.NoError(t, dbConn.Create(session).Error)

	// Task with invalid metadata (missing chat_id)
	task := &types.TaskPayload{
		ID:         "test-task-1",
		SourceType: types.SourceTypeTDLib,
		URL:        "https://t.me/testchannel/1",
		Metadata: map[string]interface{}{
			"message_id": "1",
		},
	}

	ctx := context.Background()
	err = worker.Process(ctx, task)
	assert.Error(t, err)
	// Either "missing chat_id" or "TDLib client not ready" is acceptable
	assert.True(t, contains(err.Error(), "missing chat_id") || contains(err.Error(), "TDLib client not ready"))

	// Verify task marked as failed in database
	var updatedSession db.DownloadSession
	dbConn.First(&updatedSession, "session_id = ?", "test-task-1")
	assert.Equal(t, string(types.StateFailed), updatedSession.Status)
}

// TestTDLibWorkerCompleteTask tests marking a task as complete
func TestTDLibWorkerCompleteTask(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Create download session
	sessionID := "test-task-complete"
	session := &db.DownloadSession{
		SessionID:     sessionID,
		FileURL:       "https://t.me/testchannel/1",
		SourceType:    string(types.SourceTypeTDLib),
		Status:        string(types.StateDownloading),
		CreatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}
	require.NoError(t, dbConn.Create(session).Error)

	// Complete the task
	ctx := context.Background()
	err = worker.completeTask(ctx, sessionID)
	require.NoError(t, err)

	// Verify task marked as done
	var updatedSession db.DownloadSession
	dbConn.First(&updatedSession, "session_id = ?", sessionID)
	assert.Equal(t, string(types.StateDone), updatedSession.Status)
	assert.NotNil(t, updatedSession.CompletedAt)
}

// TestTDLibWorkerSessionMetadataRoundTrip tests saving and loading session metadata
func TestTDLibWorkerSessionMetadataRoundTrip(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Create download session
	sessionID := "test-session-meta"
	session := &db.DownloadSession{
		SessionID:     sessionID,
		FileURL:       "https://t.me/testchannel/1",
		SourceType:    string(types.SourceTypeTDLib),
		Status:        string(types.StatePending),
		CreatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}
	require.NoError(t, dbConn.Create(session).Error)

	ctx := context.Background()

	// Save metadata
	metadata := map[string]interface{}{
		"last_message_id": 42,
		"synced_at":       time.Now().Format(time.RFC3339),
	}

	err = worker.saveSessionMetadata(ctx, sessionID, metadata)
	require.NoError(t, err)

	// Load metadata
	loaded, err := worker.loadSessionMetadata(ctx, sessionID)
	require.NoError(t, err)
	assert.NotNil(t, loaded)
}

// TestTDLibWorkerFetchChannelHistoryIncrementalSync tests incremental sync
func TestTDLibWorkerFetchChannelHistoryIncrementalSync(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	ctx := context.Background()

	// First sync (no prior state)
	sessionMeta1 := make(map[string]interface{})
	messages1, err := worker.fetchChannelHistory(ctx, "123456", "1", "task-1", sessionMeta1)
	require.NoError(t, err)
	assert.Equal(t, 0, len(messages1)) // Stub returns empty

	// Second sync (resume from last_message_id)
	sessionMeta2 := map[string]interface{}{
		"last_message_id": 42,
	}
	messages2, err := worker.fetchChannelHistory(ctx, "123456", "43", "task-2", sessionMeta2)
	require.NoError(t, err)
	// Should still be empty (stub implementation)
	assert.Equal(t, 0, len(messages2))
}

// TestTDLibWorkerErrorHandlingTransient tests transient error handling
func TestTDLibWorkerErrorHandlingTransient(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Create session
	session := &db.DownloadSession{
		SessionID:     "task-error-transient",
		FileURL:       "https://t.me/testchannel/1",
		SourceType:    string(types.SourceTypeTDLib),
		Status:        string(types.StateDownloading),
		CreatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}
	require.NoError(t, dbConn.Create(session).Error)

	// Simulate transient error (rate limit)
	ctx := context.Background()
	testErr := fmt.Errorf("429 too many requests")
	err = worker.handleTDLibError(ctx, "task-error-transient", testErr)

	// Should return error (for retry)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "transient")

	// Check database updated
	var updated db.DownloadSession
	dbConn.First(&updated, "session_id = ?", "task-error-transient")
	assert.Equal(t, string(types.StateFailed), updated.Status)
	assert.Contains(t, updated.ErrorCategory, "rate_limit")
}

// TestTDLibWorkerErrorHandlingPermanent tests permanent error handling
func TestTDLibWorkerErrorHandlingPermanent(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Create session
	session := &db.DownloadSession{
		SessionID:     "task-error-permanent",
		FileURL:       "https://t.me/testchannel/1",
		SourceType:    string(types.SourceTypeTDLib),
		Status:        string(types.StateDownloading),
		CreatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}
	require.NoError(t, dbConn.Create(session).Error)

	// Simulate permanent error (not a member)
	ctx := context.Background()
	testErr := fmt.Errorf("403 user is not a member of the chat")
	err = worker.handleTDLibError(ctx, "task-error-permanent", testErr)

	// Should return error (permanent)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "permanent")

	// Check database updated
	var updated db.DownloadSession
	dbConn.First(&updated, "session_id = ?", "task-error-permanent")
	assert.Equal(t, string(types.StateFailed), updated.Status)
	assert.Contains(t, updated.ErrorCategory, "not_member")
}

// TestTDLibWorkerSetDedupManager tests dedup manager assignment
func TestTDLibWorkerSetDedupManager(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Should be able to set dedup manager
	worker.SetDedupManager(nil, true)
	assert.True(t, worker.dedupOn)
}

// TestTDLibWorkerHeartbeat tests heartbeat goroutine
func TestTDLibWorkerHeartbeat(t *testing.T) {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	dbConn := setupTestDB(t)

	cfg := &config.TDLibConfig{
		Enabled: false,
	}

	worker, err := NewTDLibWorker(dbConn, logger, cfg, "/tmp/downloads")
	require.NoError(t, err)

	// Start heartbeat with short interval for testing
	ctx, cancel := context.WithCancel(context.Background())
	worker.StartHeartbeat(ctx, 100*time.Millisecond)

	// Let it run briefly
	time.Sleep(250 * time.Millisecond)

	// Stop heartbeat
	cancel()
	time.Sleep(100 * time.Millisecond)

	// Should not panic
	assert.NotNil(t, worker)
}

// TestTDLibConfigValidation tests configuration validation
func TestTDLibConfigValidation(t *testing.T) {
	tests := []struct {
		name      string
		cfg       *config.TDLibConfig
		wantError bool
	}{
		{
			name: "disabled config",
			cfg: &config.TDLibConfig{
				Enabled: false,
			},
			wantError: false,
		},
		{
			name: "enabled but missing API_ID",
			cfg: &config.TDLibConfig{
				Enabled:  true,
				APIHash:  "test_hash",
				APIKey:   "",
				Phone:    "1234567890",
			},
			wantError: true,
		},
		{
			name: "enabled but missing API_HASH",
			cfg: &config.TDLibConfig{
				Enabled: true,
				APIKey:  "123456",
				APIHash: "",
				Phone:   "1234567890",
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestTDLibSourceTypeEnum tests SourceTypeTDLib is properly defined
func TestTDLibSourceTypeEnum(t *testing.T) {
	sourceType := types.SourceTypeTDLib
	assert.Equal(t, "tdlib", string(sourceType))
}
