package webhook

import (
	"testing"
	"time"
)

func TestSigner_Sign(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := int64(1712599540)
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, timestamp, body)

	// Verify signature format
	if len(signature) < 11 || signature[:7] != "sha256=" {
		t.Errorf("invalid signature format: %s", signature)
	}

	// Verify signature is deterministic (same inputs always produce same output)
	signature2 := signer.Sign(secret, timestamp, body)
	if signature != signature2 {
		t.Errorf("signature not deterministic: %s != %s", signature, signature2)
	}
}

func TestSigner_VerifySignature_Valid(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix() // Current time
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, timestamp, body)

	err := signer.VerifySignature(secret, signature, timestamp, body)
	if err != nil {
		t.Errorf("valid signature rejected: %v", err)
	}
}

func TestSigner_VerifySignature_InvalidSignature(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	// Tampered signature
	badSignature := "sha256=invalid1234567890"

	err := signer.VerifySignature(secret, badSignature, timestamp, body)
	if err == nil {
		t.Errorf("invalid signature accepted")
	}
}

func TestSigner_VerifySignature_WrongSecret(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	wrongSecret := "wrong-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, timestamp, body)

	// Verify with wrong secret should fail
	err := signer.VerifySignature(wrongSecret, signature, timestamp, body)
	if err == nil {
		t.Errorf("signature verified with wrong secret")
	}
}

func TestSigner_VerifySignature_StaleTimestamp(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	staleTimestamp := time.Now().Unix() - 10*60 // 10 minutes ago
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, staleTimestamp, body)

	err := signer.VerifySignature(secret, signature, staleTimestamp, body)
	if err == nil {
		t.Errorf("stale timestamp accepted (> 5 minutes)")
	}
}

func TestSigner_VerifySignature_FutureTimestamp(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	futureTimestamp := time.Now().Unix() + 10*60 // 10 minutes in future
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, futureTimestamp, body)

	err := signer.VerifySignature(secret, signature, futureTimestamp, body)
	if err == nil {
		t.Errorf("future timestamp accepted")
	}
}

func TestSigner_VerifySignature_TamperedBody(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	signature := signer.Sign(secret, timestamp, body)

	// Tampered body
	tamperedBody := []byte(`{"task_id":"task-123","status":"failed"}`)

	err := signer.VerifySignature(secret, signature, timestamp, tamperedBody)
	if err == nil {
		t.Errorf("tampered body accepted")
	}
}

func TestSigner_VerifySignature_EdgeCase5MinutesBoundary(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	// Exactly 5 minutes ago (should be accepted)
	timestamp5MinAgo := time.Now().Unix() - 5*60
	signature5MinAgo := signer.Sign(secret, timestamp5MinAgo, body)

	err := signer.VerifySignature(secret, signature5MinAgo, timestamp5MinAgo, body)
	if err != nil {
		t.Errorf("timestamp exactly 5 minutes old rejected: %v", err)
	}

	// 5 minutes and 1 second ago (should be rejected)
	timestamp5MinPlus1Ago := time.Now().Unix() - 5*60 - 1
	signature5MinPlus1Ago := signer.Sign(secret, timestamp5MinPlus1Ago, body)

	err = signer.VerifySignature(secret, signature5MinPlus1Ago, timestamp5MinPlus1Ago, body)
	if err == nil {
		t.Errorf("timestamp >5 minutes old accepted")
	}
}

func TestSigner_ConsistencyWithTimestamp(t *testing.T) {
	signer := NewSigner()
	secret := "test-secret-key"
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	// Test with fresh timestamps to avoid stale checks
	now := time.Now().Unix()
	timestamp1 := now
	timestamp2 := now + 1

	sig1 := signer.Sign(secret, timestamp1, body)
	sig2 := signer.Sign(secret, timestamp2, body)

	// Signatures must be different for different timestamps
	if sig1 == sig2 {
		t.Errorf("different timestamps produce same signature")
	}

	// Each signature must be valid only for its own timestamp
	err1 := signer.VerifySignature(secret, sig1, timestamp1, body)
	if err1 != nil {
		t.Errorf("signature not valid for its own timestamp: %v", err1)
	}

	// Attempting to verify sig1 with timestamp2 should fail
	err2 := signer.VerifySignature(secret, sig1, timestamp2, body)
	if err2 == nil {
		t.Errorf("signature verified with different timestamp")
	}
}

func TestRetryBackoffDuration(t *testing.T) {
	tests := []struct {
		attemptCount int
		expected     time.Duration
	}{
		{0, 3 * time.Second},
		{1, 9 * time.Second},
		{2, 27 * time.Second},
		{3, 27 * time.Second}, // Capped at max
		{10, 27 * time.Second}, // Capped at max
	}

	for i, tt := range tests {
		got := RetryBackoffDuration(tt.attemptCount)
		if got != tt.expected {
			t.Errorf("test %d: attemptCount=%d, expected %v, got %v",
				i, tt.attemptCount, tt.expected, got)
		}
	}
}

func BenchmarkSigner_Sign(b *testing.B) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = signer.Sign(secret, timestamp, body)
	}
}

func BenchmarkSigner_VerifySignature(b *testing.B) {
	signer := NewSigner()
	secret := "test-secret-key"
	timestamp := time.Now().Unix()
	body := []byte(`{"task_id":"task-123","status":"completed"}`)
	signature := signer.Sign(secret, timestamp, body)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = signer.VerifySignature(secret, signature, timestamp, body)
	}
}
