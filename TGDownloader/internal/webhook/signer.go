package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// Signer handles HMAC-SHA256 signature generation and verification for webhooks
type Signer struct{}

// NewSigner creates a new webhook signer
func NewSigner() *Signer {
	return &Signer{}
}

// Sign generates HMAC-SHA256 signature for a webhook payload with timestamp
// Returns signature in format "sha256=<hex>"
func (s *Signer) Sign(secret string, timestamp int64, body []byte) string {
	// Signature includes both timestamp and body to prevent replay attacks
	message := strconv.FormatInt(timestamp, 10) + string(body)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	digest := hex.EncodeToString(h.Sum(nil))
	return fmt.Sprintf("sha256=%s", digest)
}

// VerifySignature verifies HMAC-SHA256 signature and checks timestamp freshness
// Returns error if signature invalid, timestamp stale (> 5 minutes), or validation fails
func (s *Signer) VerifySignature(secret string, signature string, timestamp int64, body []byte) error {
	// Check timestamp freshness (reject > 5 minutes old)
	now := time.Now().Unix()
	age := now - timestamp
	if age < 0 || age > 5*60 {
		return fmt.Errorf("timestamp invalid or stale: age=%d seconds", age)
	}

	// Compute expected signature
	expected := s.Sign(secret, timestamp, body)

	// Use constant-time comparison to prevent timing attacks
	if !hmac.Equal([]byte(signature), []byte(expected)) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}
