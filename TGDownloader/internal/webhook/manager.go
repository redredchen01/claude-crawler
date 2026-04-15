package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// DeliveryStatus constants
const (
	DeliveryStatusPending   = "pending"
	DeliveryStatusDelivered = "delivered"
	DeliveryStatusFailed    = "failed"
)

// Manager handles webhook registration, delivery, and retry logic
type Manager struct {
	db     *gorm.DB
	logger *zap.Logger
	signer *Signer
	client *http.Client
}

// NewManager creates a new webhook manager
func NewManager(dbConn *gorm.DB, logger *zap.Logger) *Manager {
	return &Manager{
		db:     dbConn,
		logger: logger,
		signer: NewSigner(),
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// WebhookPayload represents the JSON payload sent to webhook endpoints
type WebhookPayload struct {
	TaskID    string                 `json:"task_id"`
	UserID    int64                  `json:"user_id"`
	Status    string                 `json:"status"`
	EventType string                 `json:"event_type"` // e.g., "download.completed"
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data"`
}

// RegisterWebhook registers a webhook for a user with SSRF validation
func (m *Manager) RegisterWebhook(ctx context.Context, userID int64, webhookURL string, secret string) (*db.Webhook, error) {
	// SSRF prevention: reject internal IP ranges
	if err := validateWebhookURL(webhookURL); err != nil {
		m.logger.Warn("webhook URL validation failed",
			zap.Int64("user_id", userID),
			zap.String("url", webhookURL),
			zap.Error(err),
		)
		return nil, err
	}

	webhook := &db.Webhook{
		UserID: userID,
		URL:    webhookURL,
		Secret: secret,
		Active: true,
	}

	if err := m.db.WithContext(ctx).Create(webhook).Error; err != nil {
		m.logger.Error("failed to register webhook",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return nil, err
	}

	m.logger.Info("webhook registered",
		zap.Int64("webhook_id", webhook.ID),
		zap.Int64("user_id", userID),
	)
	return webhook, nil
}

// CreateDeliveryTask creates a pending webhook delivery task for a download completion
func (m *Manager) CreateDeliveryTask(ctx context.Context, userID int64, taskID string, webhookURL string, webhookSecret string, payload map[string]interface{}) error {
	// Find or create webhook if needed
	var webhook db.Webhook
	if err := m.db.WithContext(ctx).
		Where("user_id = ? AND url = ? AND active = true", userID, webhookURL).
		First(&webhook).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			m.logger.Warn("webhook not found for user, skipping delivery",
				zap.Int64("user_id", userID),
				zap.String("url", webhookURL),
			)
			return nil // Webhook not registered; skip
		}
		return err
	}

	// Create delivery task
	delivery := &db.WebhookDelivery{
		WebhookID:    webhook.ID,
		TaskID:       taskID,
		UserID:       userID,
		Status:       string(DeliveryStatusPending),
		AttemptCount: 0,
	}

	if err := m.db.WithContext(ctx).Create(delivery).Error; err != nil {
		m.logger.Error("failed to create webhook delivery task",
			zap.Int64("webhook_id", webhook.ID),
			zap.String("task_id", taskID),
			zap.Error(err),
		)
		return err
	}

	m.logger.Info("webhook delivery task created",
		zap.Int64("delivery_id", delivery.ID),
		zap.String("task_id", taskID),
	)
	return nil
}

// DeliverWebhook attempts to deliver a webhook with signature verification
// Returns error if delivery fails; caller handles retries
func (m *Manager) DeliverWebhook(ctx context.Context, delivery *db.WebhookDelivery, webhook *db.Webhook, payload *WebhookPayload) error {
	// Marshal payload
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	// Generate signature with current timestamp
	timestamp := time.Now().Unix()
	signature := m.signer.Sign(webhook.Secret, timestamp, bodyBytes)

	// Create HTTP request with signature headers
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhook.URL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create webhook request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature-256", signature)
	req.Header.Set("X-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("User-Agent", "TGDownloader/v2.0.0")

	// Execute request
	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook delivery failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body for logging
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	// Check HTTP status code
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Success (2xx)
		m.logger.Info("webhook delivered successfully",
			zap.Int64("delivery_id", delivery.ID),
			zap.String("task_id", delivery.TaskID),
			zap.Int("status_code", resp.StatusCode),
		)
		return nil
	} else if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		// Client error (4xx) - do not retry
		errMsg := fmt.Sprintf("webhook client error: HTTP %d: %s", resp.StatusCode, string(respBody))
		m.logger.Warn("webhook delivery failed with client error (no retry)",
			zap.Int64("delivery_id", delivery.ID),
			zap.String("task_id", delivery.TaskID),
			zap.Int("status_code", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return fmt.Errorf(errMsg)
	} else {
		// Server error (5xx) or other - retry
		errMsg := fmt.Sprintf("webhook server error: HTTP %d: %s", resp.StatusCode, string(respBody))
		m.logger.Warn("webhook delivery failed with server error (will retry)",
			zap.Int64("delivery_id", delivery.ID),
			zap.String("task_id", delivery.TaskID),
			zap.Int("status_code", resp.StatusCode),
			zap.String("response", string(respBody)),
		)
		return fmt.Errorf(errMsg)
	}
}

// RetryBackoffDuration returns exponential backoff duration for retry attempt
// Attempts: 0->3s, 1->9s, 2->27s
func RetryBackoffDuration(attemptCount int) time.Duration {
	backoffs := []time.Duration{3 * time.Second, 9 * time.Second, 27 * time.Second}
	if attemptCount >= len(backoffs) {
		return backoffs[len(backoffs)-1]
	}
	return backoffs[attemptCount]
}

// ProcessDeliveries processes pending webhook deliveries with retry logic and circuit breaker
func (m *Manager) ProcessDeliveries(ctx context.Context) error {
	// Find all pending deliveries that are ready to retry
	var deliveries []db.WebhookDelivery
	now := time.Now()

	err := m.db.WithContext(ctx).
		Where("status = ? AND (next_retry_at IS NULL OR next_retry_at <= ?)", string(DeliveryStatusPending), now).
		Order("id ASC").
		Limit(100). // Process in batches to avoid overwhelming
		Find(&deliveries).Error

	if err != nil {
		m.logger.Error("failed to fetch pending webhook deliveries", zap.Error(err))
		return err
	}

	for _, delivery := range deliveries {
		// Re-fetch webhook to check if still active (circuit breaker check)
		var webhook db.Webhook
		if err := m.db.WithContext(ctx).First(&webhook, delivery.WebhookID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				m.logger.Warn("webhook not found for delivery, marking failed",
					zap.Int64("delivery_id", delivery.ID),
				)
				m.markDeliveryFailed(ctx, &delivery, "webhook not found")
				continue
			}
			m.logger.Error("failed to fetch webhook", zap.Error(err))
			continue
		}

		// Check if webhook has been circuit-broken (inactive)
		if !webhook.IsValid() {
			m.logger.Info("webhook inactive (circuit breaker), skipping delivery",
				zap.Int64("webhook_id", webhook.ID),
				zap.Int64("delivery_id", delivery.ID),
			)
			continue
		}

		// Fetch task data for payload
		var task db.DownloadSession
		if err := m.db.WithContext(ctx).Where("session_id = ?", delivery.TaskID).First(&task).Error; err != nil {
			m.logger.Error("failed to fetch download session",
				zap.String("task_id", delivery.TaskID),
				zap.Error(err),
			)
			continue
		}

		// Build payload
		payload := &WebhookPayload{
			TaskID:    delivery.TaskID,
			UserID:    delivery.UserID,
			Status:    task.Status,
			EventType: "download.completed",
			Timestamp: time.Now().Unix(),
			Data: map[string]interface{}{
				"file_url": task.FileURL,
				"size":     task.TotalSizeBytes,
				"sha256":   task.SHA256,
			},
		}

		// Attempt delivery
		err := m.DeliverWebhook(ctx, &delivery, &webhook, payload)

		if err == nil {
			// Success
			m.markDeliverySuccess(ctx, &delivery)
		} else {
			// Failed delivery
			if delivery.CanRetry() {
				// Schedule retry with exponential backoff
				m.scheduleRetry(ctx, &delivery)
			} else {
				// Max retries exceeded
				m.markDeliveryFailed(ctx, &delivery, err.Error())

				// Check for circuit breaker: mark webhook inactive if 5+ consecutive failures
				if m.shouldTripCircuitBreaker(ctx, webhook.ID) {
					m.logger.Error("circuit breaker activated for webhook",
						zap.Int64("webhook_id", webhook.ID),
					)
					m.db.WithContext(ctx).Model(&webhook).Update("active", false)
				}
			}
		}
	}

	return nil
}

// markDeliverySuccess marks a delivery as successfully delivered
func (m *Manager) markDeliverySuccess(ctx context.Context, delivery *db.WebhookDelivery) {
	now := time.Now()
	if err := m.db.WithContext(ctx).Model(delivery).Updates(map[string]interface{}{
		"status":         string(DeliveryStatusDelivered),
		"delivered_at":   now,
		"last_attempt_at": now,
	}).Error; err != nil {
		m.logger.Error("failed to mark delivery as succeeded",
			zap.Int64("delivery_id", delivery.ID),
			zap.Error(err),
		)
	} else {
		m.logger.Info("delivery marked successful",
			zap.Int64("delivery_id", delivery.ID),
		)
	}
}

// scheduleRetry schedules the next retry attempt with exponential backoff
func (m *Manager) scheduleRetry(ctx context.Context, delivery *db.WebhookDelivery) {
	backoff := RetryBackoffDuration(delivery.AttemptCount)
	nextRetryAt := time.Now().Add(backoff)

	if err := m.db.WithContext(ctx).Model(delivery).Updates(map[string]interface{}{
		"attempt_count":  gorm.Expr("attempt_count + 1"),
		"next_retry_at":  nextRetryAt,
		"last_attempt_at": time.Now(),
	}).Error; err != nil {
		m.logger.Error("failed to schedule retry",
			zap.Int64("delivery_id", delivery.ID),
			zap.Error(err),
		)
	} else {
		m.logger.Info("retry scheduled",
			zap.Int64("delivery_id", delivery.ID),
			zap.Duration("backoff", backoff),
		)
	}
}

// markDeliveryFailed marks a delivery as permanently failed
func (m *Manager) markDeliveryFailed(ctx context.Context, delivery *db.WebhookDelivery, errorMsg string) {
	if err := m.db.WithContext(ctx).Model(delivery).Updates(map[string]interface{}{
		"status":          string(DeliveryStatusFailed),
		"last_error":      errorMsg,
		"last_attempt_at": time.Now(),
	}).Error; err != nil {
		m.logger.Error("failed to mark delivery as failed",
			zap.Int64("delivery_id", delivery.ID),
			zap.Error(err),
		)
	} else {
		m.logger.Info("delivery marked failed",
			zap.Int64("delivery_id", delivery.ID),
			zap.String("error", errorMsg),
		)
	}
}

// shouldTripCircuitBreaker checks if webhook has 5+ consecutive delivery failures
func (m *Manager) shouldTripCircuitBreaker(ctx context.Context, webhookID int64) bool {
	var count int64
	err := m.db.WithContext(ctx).
		Model(&db.WebhookDelivery{}).
		Where("webhook_id = ? AND status = ?", webhookID, string(DeliveryStatusFailed)).
		Count(&count).Error

	if err != nil {
		m.logger.Error("failed to count webhook failures", zap.Error(err))
		return false
	}

	return count >= 5
}

// validateWebhookURL performs SSRF validation on webhook URLs
// Rejects internal IP ranges: 127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
func validateWebhookURL(webhookURL string) error {
	parsedURL, err := url.Parse(webhookURL)
	if err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}

	// Validate scheme
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("webhook URL must use http or https scheme")
	}

	// Resolve hostname to IP
	hostname := parsedURL.Hostname()
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return fmt.Errorf("failed to resolve webhook URL hostname: %w", err)
	}

	// Check for internal IP ranges
	for _, ip := range ips {
		if isInternalIP(ip) {
			return fmt.Errorf("webhook URL resolves to internal IP address: %s", ip.String())
		}
	}

	return nil
}

// isInternalIP checks if an IP address is in internal/private ranges
func isInternalIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsPrivate() {
		return true
	}
	// Check additional ranges
	_, localhost, _ := net.ParseCIDR("127.0.0.0/8")
	_, class10, _ := net.ParseCIDR("10.0.0.0/8")
	_, class172, _ := net.ParseCIDR("172.16.0.0/12")
	_, class192, _ := net.ParseCIDR("192.168.0.0/16")

	return localhost.Contains(ip) || class10.Contains(ip) || class172.Contains(ip) || class192.Contains(ip)
}
