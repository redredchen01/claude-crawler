package webhook

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

func setupTestDB(t *testing.T) *gorm.DB {
	dbConn := testutil.SetupTestDB(t)

	// Migrate webhook models
	if err := dbConn.AutoMigrate(&db.Webhook{}, &db.WebhookDelivery{}, &db.DownloadSession{}); err != nil {
		t.Fatalf("failed to migrate webhook models: %v", err)
	}

	return dbConn
}

func TestManager_RegisterWebhook_Success(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Create test user
	user := &db.User{Username: "testuser"}
	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	ctx := context.Background()
	webhookURL := "https://example.com/webhook"
	secret := "test-secret-key"

	webhook, err := manager.RegisterWebhook(ctx, user.ID, webhookURL, secret)
	if err != nil {
		t.Fatalf("RegisterWebhook failed: %v", err)
	}

	if webhook.ID == 0 || webhook.UserID != user.ID || webhook.URL != webhookURL {
		t.Errorf("webhook not created correctly: %+v", webhook)
	}

	if !webhook.Active || webhook.DeletedAt != nil {
		t.Errorf("webhook not in correct state: Active=%v, DeletedAt=%v", webhook.Active, webhook.DeletedAt)
	}
}

func TestManager_RegisterWebhook_SSRF_127_0_0_1(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	ctx := context.Background()
	_, err := manager.RegisterWebhook(ctx, user.ID, "http://127.0.0.1:8080/webhook", "secret")
	if err == nil {
		t.Errorf("RegisterWebhook accepted internal IP 127.0.0.1")
	}
}

func TestManager_RegisterWebhook_SSRF_10_0_0_0(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	ctx := context.Background()
	_, err := manager.RegisterWebhook(ctx, user.ID, "http://10.0.0.5:8080/webhook", "secret")
	if err == nil {
		t.Errorf("RegisterWebhook accepted internal IP 10.0.0.5")
	}
}

func TestManager_RegisterWebhook_SSRF_InvalidURL(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	ctx := context.Background()
	_, err := manager.RegisterWebhook(ctx, user.ID, "not-a-valid-url", "secret")
	if err == nil {
		t.Errorf("RegisterWebhook accepted invalid URL")
	}
}

func TestManager_CreateDeliveryTask(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Create user and webhook
	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    "https://example.com/webhook",
		Secret: "test-secret",
		Active: true,
	}
	dbConn.Create(webhook)

	ctx := context.Background()
	taskID := "task-123"
	payload := map[string]interface{}{"status": "completed"}

	err := manager.CreateDeliveryTask(ctx, user.ID, taskID, webhook.URL, webhook.Secret, payload)
	if err != nil {
		t.Fatalf("CreateDeliveryTask failed: %v", err)
	}

	// Verify delivery task was created
	var delivery db.WebhookDelivery
	if err := dbConn.Where("task_id = ?", taskID).First(&delivery).Error; err != nil {
		t.Fatalf("delivery task not created: %v", err)
	}

	if delivery.Status != DeliveryStatusPending || delivery.AttemptCount != 0 {
		t.Errorf("delivery task in wrong state: Status=%s, AttemptCount=%d", delivery.Status, delivery.AttemptCount)
	}
}

func TestManager_DeliverWebhook_Success(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Mock HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify headers
		if r.Header.Get("X-Signature-256") == "" {
			t.Errorf("missing X-Signature-256 header")
		}
		if r.Header.Get("X-Timestamp") == "" {
			t.Errorf("missing X-Timestamp header")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    server.URL,
		Secret: "test-secret",
		Active: true,
	}
	dbConn.Create(webhook)

	delivery := &db.WebhookDelivery{
		WebhookID:    webhook.ID,
		TaskID:       "task-123",
		UserID:       user.ID,
		Status:       DeliveryStatusPending,
		AttemptCount: 0,
	}

	payload := &WebhookPayload{
		TaskID:    "task-123",
		UserID:    user.ID,
		Status:    "completed",
		EventType: "download.completed",
		Timestamp: time.Now().Unix(),
	}

	ctx := context.Background()
	err := manager.DeliverWebhook(ctx, delivery, webhook, payload)
	if err != nil {
		t.Fatalf("DeliverWebhook failed: %v", err)
	}
}

func TestManager_DeliverWebhook_ServerError(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Mock HTTP server returning 500
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    server.URL,
		Secret: "test-secret",
		Active: true,
	}
	dbConn.Create(webhook)

	delivery := &db.WebhookDelivery{
		WebhookID:    webhook.ID,
		TaskID:       "task-123",
		UserID:       user.ID,
		Status:       DeliveryStatusPending,
		AttemptCount: 0,
	}

	payload := &WebhookPayload{
		TaskID:    "task-123",
		UserID:    user.ID,
		Status:    "completed",
		EventType: "download.completed",
		Timestamp: time.Now().Unix(),
	}

	ctx := context.Background()
	err := manager.DeliverWebhook(ctx, delivery, webhook, payload)
	if err == nil {
		t.Errorf("DeliverWebhook accepted 500 response (should error)")
	}
}

func TestManager_DeliverWebhook_ClientError(t *testing.T) {
	dbConn := setupTestDB(t)
	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Mock HTTP server returning 400
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	user := &db.User{Username: "testuser"}
	dbConn.Create(user)

	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    server.URL,
		Secret: "test-secret",
		Active: true,
	}
	dbConn.Create(webhook)

	delivery := &db.WebhookDelivery{
		WebhookID:    webhook.ID,
		TaskID:       "task-123",
		UserID:       user.ID,
		Status:       DeliveryStatusPending,
		AttemptCount: 0,
	}

	payload := &WebhookPayload{
		TaskID:    "task-123",
		UserID:    user.ID,
		Status:    "completed",
		EventType: "download.completed",
		Timestamp: time.Now().Unix(),
	}

	ctx := context.Background()
	err := manager.DeliverWebhook(ctx, delivery, webhook, payload)
	if err == nil {
		t.Errorf("DeliverWebhook accepted 400 response (should error)")
	}
}

func TestWebhookDelivery_CanRetry(t *testing.T) {
	tests := []struct {
		name         string
		attemptCount int
		canRetry     bool
	}{
		{"attempt 0", 0, true},
		{"attempt 1", 1, true},
		{"attempt 2", 2, true},
		{"attempt 3", 3, false}, // Max 3 attempts
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			delivery := &db.WebhookDelivery{
				AttemptCount: tt.attemptCount,
			}
			if got := delivery.CanRetry(); got != tt.canRetry {
				t.Errorf("attemptCount=%d, expected canRetry=%v, got %v",
					tt.attemptCount, tt.canRetry, got)
			}
		})
	}
}

func TestRetryBackoffDuration_Values(t *testing.T) {
	expected := []time.Duration{
		3 * time.Second,
		9 * time.Second,
		27 * time.Second,
	}

	for i := 0; i < 3; i++ {
		got := RetryBackoffDuration(i)
		if got != expected[i] {
			t.Errorf("attemptCount=%d: expected %v, got %v", i, expected[i], got)
		}
	}
}
