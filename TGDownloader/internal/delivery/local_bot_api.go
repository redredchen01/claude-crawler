package delivery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// LocalBotAPIClient handles communication with local Telegram Bot API Server
type LocalBotAPIClient struct {
	baseURL    string
	chatID     int64
	httpClient *http.Client
	db         *gorm.DB
	logger     *zap.Logger
	maxRetries int
	baseWaitMS int
	downloadDir string
}

// SendFileResponse is the response from local Bot API server
type SendFileResponse struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result"`
	ErrorCode int           `json:"error_code,omitempty"`
	Description string        `json:"description,omitempty"`
}

// NewLocalBotAPIClient creates a client for local Bot API Server
func NewLocalBotAPIClient(
	baseURL string,
	chatID int64,
	db *gorm.DB,
	logger *zap.Logger,
	botAPIConfig *config.BotAPIConfig,
	downloadDir string,
) *LocalBotAPIClient {
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:       10,
			IdleConnTimeout:    90 * time.Second,
			DisableCompression: false,
		},
	}

	return &LocalBotAPIClient{
		baseURL:     baseURL,
		chatID:      chatID,
		httpClient:  client,
		db:          db,
		logger:      logger,
		maxRetries:  botAPIConfig.MaxRetries,
		baseWaitMS:  botAPIConfig.RetryBaseWaitMS,
		downloadDir: downloadDir,
	}
}

// SendDocument sends a file to Telegram using local Bot API Server
// filePath should be session_id or a path within downloadDir
func (c *LocalBotAPIClient) SendDocument(ctx context.Context, filePath string, sessionID string) (string, error) {
	// Validate session exists
	var session db.DownloadSession
	if err := c.db.First(&session, "session_id = ?", sessionID).Error; err != nil {
		c.logger.Warn("invalid session_id",
			zap.String("session_id", sessionID),
			zap.Error(err),
		)
		return "", fmt.Errorf("session not found: %w", err)
	}

	// Construct safe path using filepath.Join which normalizes and prevents traversal
	fullPath := filepath.Join(c.downloadDir, sessionID)

	// Verify the resolved path is still within downloadDir to prevent traversal
	absDownloadDir, _ := filepath.Abs(c.downloadDir)
	absPath, _ := filepath.Abs(fullPath)
	if !filepath.HasPrefix(absPath, absDownloadDir) {
		c.logger.Warn("path traversal attempt detected",
			zap.String("session_id", sessionID),
			zap.String("attempted_path", fullPath),
			zap.String("normalized_path", absPath),
		)
		return "", fmt.Errorf("invalid path: outside base directory")
	}

	// For local Bot API Server, use file:// URL
	fileURL := fmt.Sprintf("file://%s", absPath)

	c.logger.Info("sending file to local Bot API Server",
		zap.String("url", c.baseURL),
		zap.String("file_path", fileURL),
		zap.String("session_id", sessionID),
	)

	var fileID string
	var err error

	// Retry logic with exponential backoff
	for attempt := 0; attempt < c.maxRetries; attempt++ {
		fileID, err = c.sendWithRetry(ctx, fileURL)
		if err == nil {
			c.logger.Info("successfully sent file to local Bot API",
				zap.String("file_id", fileID),
				zap.String("session_id", sessionID),
			)
			return fileID, nil
		}

		// Check if it's a rate limit error
		if isRateLimitError(err) {
			waitMS := c.baseWaitMS * (1 << uint(attempt)) // exponential backoff
			c.logger.Warn("rate limited, retrying",
				zap.Int("attempt", attempt+1),
				zap.Int("max_retries", c.maxRetries),
				zap.Int("wait_ms", waitMS),
				zap.Error(err),
			)
			time.Sleep(time.Duration(waitMS) * time.Millisecond)
			continue
		}

		// For other errors, return immediately
		c.logger.Error("failed to send file to local Bot API",
			zap.String("session_id", sessionID),
			zap.Error(err),
		)
		return "", err
	}

	return "", fmt.Errorf("failed after %d retries: %w", c.maxRetries, err)
}

// sendWithRetry performs a single attempt to send the file
func (c *LocalBotAPIClient) sendWithRetry(ctx context.Context, fileURL string) (string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add form fields
	if err := writer.WriteField("chat_id", fmt.Sprintf("%d", c.chatID)); err != nil {
		return "", fmt.Errorf("failed to write chat_id: %w", err)
	}

	// Add file field with file:// URL
	if err := writer.WriteField("document", fileURL); err != nil {
		return "", fmt.Errorf("failed to write document field: %w", err)
	}

	writer.Close()

	// Construct request
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/sendDocument", body)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Execute request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Check if it's a network error
		if isNetworkError(err) {
			return "", &NetworkError{err: err}
		}
		return "", err
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var result SendFileResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	// Handle errors
	if !result.OK {
		switch result.ErrorCode {
		case 429:
			return "", &RateLimitError{
				Message:     result.Description,
				ErrorCode:   result.ErrorCode,
				RetryAfter:  0,
			}
		case 413:
			return "", &FileTooLargeError{
				Message:   result.Description,
				ErrorCode: result.ErrorCode,
			}
		case 401:
			return "", fmt.Errorf("authentication failed: %s", result.Description)
		case 403:
			return "", fmt.Errorf("forbidden: %s", result.Description)
		default:
			return "", fmt.Errorf("API error %d: %s", result.ErrorCode, result.Description)
		}
	}

	// Extract file_id from result
	var fileData map[string]interface{}
	if err := json.Unmarshal(result.Result, &fileData); err != nil {
		return "", fmt.Errorf("failed to parse file data: %w", err)
	}

	fileID, ok := fileData["file_id"].(string)
	if !ok {
		return "", fmt.Errorf("file_id not found in response")
	}

	return fileID, nil
}

// CustomError types
type RateLimitError struct {
	Message    string
	ErrorCode  int
	RetryAfter int
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("rate limited (HTTP %d): %s", e.ErrorCode, e.Message)
}

type FileTooLargeError struct {
	Message   string
	ErrorCode int
}

func (e *FileTooLargeError) Error() string {
	return fmt.Sprintf("file too large (HTTP %d): %s", e.ErrorCode, e.Message)
}

type NetworkError struct {
	err error
}

func (e *NetworkError) Error() string {
	return fmt.Sprintf("network error: %v", e.err)
}

// Helper functions
func isRateLimitError(err error) bool {
	_, ok := err.(*RateLimitError)
	return ok
}

func isNetworkError(err error) bool {
	if err == nil {
		return false
	}
	// Check for network-related errors
	if _, ok := err.(net.Error); ok {
		return true
	}
	if _, ok := err.(*url.Error); ok {
		return true
	}
	_, ok := err.(*NetworkError)
	return ok
}

func isFileTooLargeError(err error) bool {
	_, ok := err.(*FileTooLargeError)
	return ok
}
