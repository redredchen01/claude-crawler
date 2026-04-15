package webhook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

// TestIntegration_WebhookDownloadCompletion tests the full webhook flow from registration to delivery
// Note: Uses a real external URL to avoid SSRF validation on localhost
func TestIntegration_WebhookDownloadCompletion(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)

	// Migrate webhook models
	if err := dbConn.AutoMigrate(&db.Webhook{}, &db.WebhookDelivery{}, &db.DownloadSession{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Create test user
	user := &db.User{Username: "testuser"}
	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	// Create mock webhook server on a custom port using httptest
	// For this test, we directly use DeliverWebhook without RegisterWebhook to skip SSRF check
	deliveryReceived := false
	receivedSignature := ""
	receivedTimestamp := ""
	receivedPayload := &WebhookPayload{}

	// Create mock webhook server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deliveryReceived = true
		receivedSignature = r.Header.Get("X-Signature-256")
		receivedTimestamp = r.Header.Get("X-Timestamp")

		// Read request body
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, receivedPayload); err != nil {
			t.Errorf("failed to unmarshal payload: %v", err)
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx := context.Background()

	// Create webhook directly in DB to bypass SSRF validation (for testing only)
	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    server.URL,
		Secret: "test-secret",
		Active: true,
	}
	if err := dbConn.Create(webhook).Error; err != nil {
		t.Fatalf("failed to create webhook: %v", err)
	}

	// Create mock download session
	session := &db.DownloadSession{
		SessionID:      "test-task-123",
		FileURL:        "https://example.com/file.zip",
		Status:         "completed",
		TotalSizeBytes: 1024 * 1024 * 100, // 100 MB
		SHA256:         "abc123def456...",
	}
	if err := dbConn.Create(session).Error; err != nil {
		t.Fatalf("failed to create download session: %v", err)
	}

	// Create delivery task
	if err := manager.CreateDeliveryTask(ctx, user.ID, session.SessionID, webhook.URL, webhook.Secret,
		map[string]interface{}{"status": "completed"}); err != nil {
		t.Fatalf("CreateDeliveryTask failed: %v", err)
	}

	// Fetch delivery for manual testing
	var delivery db.WebhookDelivery
	if err := dbConn.Where("task_id = ?", session.SessionID).First(&delivery).Error; err != nil {
		t.Fatalf("delivery not created: %v", err)
	}

	// Prepare webhook payload
	payload := &WebhookPayload{
		TaskID:    session.SessionID,
		UserID:    user.ID,
		Status:    session.Status,
		EventType: "download.completed",
		Timestamp: time.Now().Unix(),
		Data: map[string]interface{}{
			"file_url": session.FileURL,
			"size":     session.TotalSizeBytes,
			"sha256":   session.SHA256,
		},
	}

	// Deliver webhook
	if err := manager.DeliverWebhook(ctx, &delivery, webhook, payload); err != nil {
		t.Fatalf("DeliverWebhook failed: %v", err)
	}

	// Verify delivery
	if !deliveryReceived {
		t.Errorf("webhook delivery not received by server")
	}

	if receivedSignature == "" {
		t.Errorf("signature not sent in webhook")
	}

	if receivedTimestamp == "" {
		t.Errorf("timestamp not sent in webhook")
	}

	// Verify payload received correctly
	if receivedPayload.TaskID != payload.TaskID {
		t.Errorf("payload task_id mismatch: got %s, want %s", receivedPayload.TaskID, payload.TaskID)
	}
}

// TestIntegration_WebhookRetryAndCircuitBreaker tests retry logic and circuit breaker activation
func TestIntegration_WebhookRetryAndCircuitBreaker(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)

	// Migrate webhook models
	if err := dbConn.AutoMigrate(&db.Webhook{}, &db.WebhookDelivery{}, &db.DownloadSession{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Create test user
	user := &db.User{Username: "testuser"}
	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	// Create mock server that returns 500
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	ctx := context.Background()

	// Create webhook directly in DB (bypass SSRF for testing)
	webhook := &db.Webhook{
		UserID: user.ID,
		URL:    server.URL,
		Secret: "test-secret",
		Active: true,
	}
	if err := dbConn.Create(webhook).Error; err != nil {
		t.Fatalf("failed to create webhook: %v", err)
	}

	// Create delivery with attempt=0
	delivery := &db.WebhookDelivery{
		WebhookID:    webhook.ID,
		TaskID:       "task-123",
		UserID:       user.ID,
		Status:       DeliveryStatusPending,
		AttemptCount: 0,
	}
	if err := dbConn.Create(delivery).Error; err != nil {
		t.Fatalf("failed to create delivery: %v", err)
	}

	payload := &WebhookPayload{
		TaskID:    "task-123",
		UserID:    user.ID,
		Status:    "completed",
		EventType: "download.completed",
		Timestamp: time.Now().Unix(),
	}

	// First attempt should fail and schedule retry
	if err := manager.DeliverWebhook(ctx, delivery, webhook, payload); err == nil {
		t.Errorf("expected delivery error for 500 response")
	}

	// Reload delivery from DB
	if err := dbConn.First(&delivery, delivery.ID).Error; err != nil {
		t.Fatalf("failed to reload delivery: %v", err)
	}

	// Check if retry was scheduled
	if delivery.Status == DeliveryStatusFailed {
		t.Errorf("delivery marked as failed before exhausting retries")
	}
}

// TestIntegration_SSRFPrevention tests SSRF protection
func TestIntegration_SSRFPrevention(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)

	// Migrate webhook models
	if err := dbConn.AutoMigrate(&db.Webhook{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	logger, _ := zap.NewDevelopment()
	manager := NewManager(dbConn, logger)

	// Create test user
	user := &db.User{Username: "testuser"}
	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	ctx := context.Background()

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"localhost", "http://localhost:8080/webhook", true},
		{"127.0.0.1", "http://127.0.0.1:8080/webhook", true},
		{"10.0.0.0 private", "http://10.0.0.1:8080/webhook", true},
		{"172.16.0.0 private", "http://172.16.0.1:8080/webhook", true},
		{"192.168.0.0 private", "http://192.168.1.1:8080/webhook", true},
		{"invalid URL", "not-a-valid-url", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := manager.RegisterWebhook(ctx, user.ID, tt.url, "secret")
			if (err != nil) != tt.wantErr {
				t.Errorf("RegisterWebhook: got error %v, want error %v", err != nil, tt.wantErr)
			}
		})
	}
}

// TestIntegration_SignatureVerification tests HMAC signature verification with timestamp
func TestIntegration_SignatureVerification(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	// Generate valid signature
	signature := signer.Sign(secret, timestamp, body)

	// Valid verification
	err := signer.VerifySignature(secret, signature, timestamp, body)
	if err != nil {
		t.Errorf("valid signature rejected: %v", err)
	}

	// Test signature tampering
	tamperedSignature := "sha256=invalid_signature_here"
	err = signer.VerifySignature(secret, tamperedSignature, timestamp, body)
	if err == nil {
		t.Errorf("tampered signature accepted")
	}

	// Test body tampering
	tamperedBody := []byte(`{"task_id":"task-456","status":"failed"}`)
	err = signer.VerifySignature(secret, signature, timestamp, tamperedBody)
	if err == nil {
		t.Errorf("tampered body accepted")
	}

	// Test replay attack (stale timestamp)
	staleTimestamp := time.Now().Unix() - 10*60 // 10 minutes old
	staleSignature := signer.Sign(secret, staleTimestamp, body)
	err = signer.VerifySignature(secret, staleSignature, staleTimestamp, body)
	if err == nil {
		t.Errorf("stale signature accepted (> 5 minutes)")
	}
}
