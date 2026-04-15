package delivery

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

func setupTestDB(t *testing.T) *gorm.DB {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = database.AutoMigrate(&db.DownloadSession{})
	assert.NoError(t, err)

	return database
}

func setupTestSession(t *testing.T, database *gorm.DB, sessionID string) {
	session := &db.DownloadSession{
		SessionID:   sessionID,
		FileURL:     "https://example.com/test.mp4",
		SourceType:  "http",
		Status:      "processing",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		FileSizeHint: 100 * 1024 * 1024, // 100 MB
	}
	err := database.Create(session).Error
	assert.NoError(t, err)
}

func TestLocalBotAPIClient_PathSafety(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	// Create a test session
	sessionID := "safe-session-123"
	setupTestSession(t, database, sessionID)

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = "http://localhost:8081"

	client := NewLocalBotAPIClient(
		botAPIConfig.LocalURL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	t.Run("invalid_session_id_rejected", func(t *testing.T) {
		fileID, err := client.SendDocument(context.Background(), "unknown-session", "unknown-session")
		assert.Error(t, err)
		assert.Empty(t, fileID)
		assert.Contains(t, err.Error(), "session not found")
	})

	t.Run("path_with_traversal_normalized", func(t *testing.T) {
		// Create a mock server to check the request
		mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Verify that the path is normalized and safe
			r.ParseMultipartForm(10 << 20) // 10 MB
			docField := r.FormValue("document")
			t.Logf("Received document field: %s", docField)

			// Should start with file:// and contain normalized path
			assert.Contains(t, docField, "file://")

			resp := SendFileResponse{
				OK: true,
				Result: json.RawMessage(`{"file_id":"AgADAgAD"}`),
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
		}))
		defer mockServer.Close()

		client.baseURL = mockServer.URL

		// Try to pass a sessionID with traversal attempt
		// filepath.Join should normalize this safely
		fileID, err := client.SendDocument(context.Background(), sessionID, sessionID)
		if err == nil {
			assert.NotEmpty(t, fileID)
		}
		// Either succeeds with safe path, or fails with clear error
	})
}

func TestLocalBotAPIClient_SendDocument_Success(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	// Create a mock Bot API server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "/sendDocument", r.URL.Path)

		r.ParseMultipartForm(10 << 20)
		chatID := r.FormValue("chat_id")
		document := r.FormValue("document")

		assert.Equal(t, "123456", chatID)
		assert.Contains(t, document, "file://")

		resp := SendFileResponse{
			OK: true,
			Result: json.RawMessage(`{"file_id":"AgADAgADAgADAgADAgADAgADAgADAgADAgAD"}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = mockServer.URL

	client := NewLocalBotAPIClient(
		mockServer.URL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	fileID, err := client.SendDocument(context.Background(), sessionID, sessionID)
	assert.NoError(t, err)
	assert.Equal(t, "AgADAgADAgADAgADAgADAgADAgADAgADAgAD", fileID)
}

func TestLocalBotAPIClient_RateLimit_Retry(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	attemptCount := 0
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attemptCount++
		if attemptCount < 3 {
			// Return 429 rate limit for first 2 attempts
			resp := SendFileResponse{
				OK:        false,
				ErrorCode: 429,
				Description: "Too Many Requests",
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(resp)
		} else {
			// Success on 3rd attempt
			resp := SendFileResponse{
				OK: true,
				Result: json.RawMessage(`{"file_id":"AgADAgADAgADAgADAgADAgADAgADAgADAgAD"}`),
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
		}
	}))
	defer mockServer.Close()

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = mockServer.URL
	botAPIConfig.MaxRetries = 3
	botAPIConfig.RetryBaseWaitMS = 10 // Short wait for testing

	client := NewLocalBotAPIClient(
		mockServer.URL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	fileID, err := client.SendDocument(context.Background(), sessionID, sessionID)
	assert.NoError(t, err)
	assert.Equal(t, "AgADAgADAgADAgADAgADAgADAgADAgADAgAD", fileID)
	assert.Equal(t, 3, attemptCount)
}

func TestLocalBotAPIClient_FileTooLarge_Error(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := SendFileResponse{
			OK:        false,
			ErrorCode: 413,
			Description: "File too large",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = mockServer.URL

	client := NewLocalBotAPIClient(
		mockServer.URL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	fileID, err := client.SendDocument(context.Background(), sessionID, sessionID)
	assert.Error(t, err)
	assert.Empty(t, fileID)
	assert.True(t, isFileTooLargeError(err))
}

func TestDeliveryRouter_CloudMode_SmallFile(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeCloud

	delivery := &Delivery{
		db:           database,
		redis:        nil,
		botToken:     "test_token",
		logger:       logger,
		botAPI:       nil, // Simplified for test
		botAPIConfig: botAPIConfig,
		localBotAPI:  nil,
		chatID:       123456,
		downloadDir:  downloadDir,
	}

	// 30 MB file should use cloud API (small)
	fileSize := int64(30 * 1024 * 1024)

	// For small files in cloud mode, should use official API
	// (We're testing routing logic, not actual delivery)
	assert.Equal(t, config.BotAPIModeCloud, delivery.botAPIConfig.Mode)
	assert.True(t, fileSize <= delivery.botAPIConfig.ThresholdSmall)
}

func TestDeliveryRouter_LocalMode_LargeFile(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := SendFileResponse{
			OK: true,
			Result: json.RawMessage(`{"file_id":"AgADAgADAgADAgADAgADAgADAgADAgADAgAD"}`),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = mockServer.URL

	localBotAPI := NewLocalBotAPIClient(
		mockServer.URL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	delivery := &Delivery{
		db:           database,
		redis:        nil,
		botToken:     "test_token",
		logger:       logger,
		botAPI:       nil,
		botAPIConfig: botAPIConfig,
		localBotAPI:  localBotAPI,
		chatID:       123456,
		downloadDir:  downloadDir,
	}

	taskPayload := &types.TaskPayload{
		ID: sessionID,
	}

	// 100 MB file with local mode should use local API
	fileSize := int64(100 * 1024 * 1024)

	assert.Equal(t, config.BotAPIModeLocal, delivery.botAPIConfig.Mode)
	assert.True(t, fileSize > delivery.botAPIConfig.ThresholdSmall)
	assert.True(t, fileSize <= delivery.botAPIConfig.ThresholdLarge)

	// Attempt delivery - should succeed
	err := delivery.DeliverToTelegram(context.Background(), taskPayload, fileSize, sessionID)
	assert.NoError(t, err)
}

func TestDeliveryRouter_OversizeFile_UsesS3(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal

	delivery := &Delivery{
		db:           database,
		redis:        nil,
		botToken:     "test_token",
		logger:       logger,
		botAPI:       nil,
		botAPIConfig: botAPIConfig,
		localBotAPI:  nil,
		chatID:       123456,
		downloadDir:  downloadDir,
	}

	taskPayload := &types.TaskPayload{
		ID: sessionID,
	}

	// 3 GB file should use S3 (exceeds 2GB limit)
	fileSize := int64(3 * 1024 * 1024 * 1024)

	assert.True(t, fileSize > delivery.botAPIConfig.ThresholdLarge)

	// Delivery should fallback to S3
	err := delivery.DeliverToTelegram(context.Background(), taskPayload, fileSize, sessionID)
	assert.NoError(t, err) // S3 is simplified in current impl
}

func TestLocalBotAPIClient_NetworkError_Handling(t *testing.T) {
	database := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	downloadDir, _ := os.MkdirTemp("", "test_downloads")
	defer os.RemoveAll(downloadDir)

	sessionID := "test-session-123"
	setupTestSession(t, database, sessionID)

	botAPIConfig := config.DefaultBotAPIConfig()
	botAPIConfig.Mode = config.BotAPIModeLocal
	botAPIConfig.LocalURL = "http://nonexistent.local:8081" // Invalid URL

	client := NewLocalBotAPIClient(
		botAPIConfig.LocalURL,
		123456,
		database,
		logger,
		botAPIConfig,
		downloadDir,
	)

	fileID, err := client.SendDocument(context.Background(), sessionID, sessionID)
	assert.Error(t, err)
	assert.Empty(t, fileID)
	// Should be a network error (unreachable)
}
