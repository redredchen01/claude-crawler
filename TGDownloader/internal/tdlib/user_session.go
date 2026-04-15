package tdlib

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"

	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// SessionManager manages TDLib session encryption and storage per user
type SessionManager struct {
	dbConn        *gorm.DB
	encryptionKey []byte
}

// NewSessionManager creates a new session manager
// encryptionKey should be 32 bytes (256 bits) for AES-256
func NewSessionManager(dbConn *gorm.DB) (*SessionManager, error) {
	keyStr := os.Getenv("TDLIB_ENCRYPTION_KEY")
	if keyStr == "" {
		return nil, fmt.Errorf("TDLIB_ENCRYPTION_KEY environment variable not set")
	}

	keyBytes, err := base64.StdEncoding.DecodeString(keyStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode TDLIB_ENCRYPTION_KEY: %w", err)
	}

	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("TDLIB_ENCRYPTION_KEY must be 32 bytes (256 bits), got %d bytes", len(keyBytes))
	}

	return &SessionManager{
		dbConn:        dbConn,
		encryptionKey: keyBytes,
	}, nil
}

// PlaintextCredentials holds decrypted credentials (never stored in DB)
type PlaintextCredentials struct {
	APIID   string
	APIHash string
	Phone   string
}

// GetUserSession fetches a user's TDLib session from the database and decrypts it
func (sm *SessionManager) GetUserSession(userID int64) (*PlaintextCredentials, error) {
	var session db.TDLibSession

	result := sm.dbConn.Where("user_id = ? AND active = ?", userID, true).First(&session)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("no active TDLib session for user %d", userID)
		}
		return nil, fmt.Errorf("failed to fetch TDLib session for user %d: %w", userID, result.Error)
	}

	// Decrypt credentials
	apiID, err := sm.decrypt(session.EncryptedAPIID)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API ID for user %d: %w", userID, err)
	}

	apiHash, err := sm.decrypt(session.EncryptedAPIHash)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt API Hash for user %d: %w", userID, err)
	}

	phone, err := sm.decrypt(session.EncryptedPhone)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt Phone for user %d: %w", userID, err)
	}

	return &PlaintextCredentials{
		APIID:   apiID,
		APIHash: apiHash,
		Phone:   phone,
	}, nil
}

// SetUserSession encrypts and stores a new TDLib session for a user
func (sm *SessionManager) SetUserSession(userID int64, apiID, apiHash, phone string) error {
	// Validate inputs
	if err := validateAPIID(apiID); err != nil {
		return err
	}
	if err := validatePhone(phone); err != nil {
		return err
	}
	if apiHash == "" {
		return fmt.Errorf("api_hash cannot be empty")
	}

	// Check if session already exists
	var existingSession db.TDLibSession
	result := sm.dbConn.Where("user_id = ?", userID).First(&existingSession)

	if result.Error != nil && result.Error != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to check existing session for user %d: %w", userID, result.Error)
	}

	// Encrypt credentials
	encAPIID, err := sm.encrypt(apiID)
	if err != nil {
		return fmt.Errorf("failed to encrypt API ID: %w", err)
	}

	encAPIHash, err := sm.encrypt(apiHash)
	if err != nil {
		return fmt.Errorf("failed to encrypt API Hash: %w", err)
	}

	encPhone, err := sm.encrypt(phone)
	if err != nil {
		return fmt.Errorf("failed to encrypt Phone: %w", err)
	}

	session := &db.TDLibSession{
		UserID:               userID,
		EncryptedAPIID:       encAPIID,
		EncryptedAPIHash:     encAPIHash,
		EncryptedPhone:       encPhone,
		Active:               true,
	}

	// If session exists, update it; otherwise create new
	if result.Error == nil {
		// Update existing session
		return sm.dbConn.Model(&existingSession).Updates(session).Error
	}

	// Create new session
	return sm.dbConn.Create(session).Error
}

// UpdateUserSession replaces existing credentials for a user
func (sm *SessionManager) UpdateUserSession(userID int64, apiID, apiHash, phone string) error {
	// Validate inputs
	if err := validateAPIID(apiID); err != nil {
		return err
	}
	if err := validatePhone(phone); err != nil {
		return err
	}
	if apiHash == "" {
		return fmt.Errorf("api_hash cannot be empty")
	}

	// Fetch existing session
	var session db.TDLibSession
	result := sm.dbConn.Where("user_id = ?", userID).First(&session)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return fmt.Errorf("no TDLib session for user %d; use SetUserSession to create one", userID)
		}
		return fmt.Errorf("failed to fetch TDLib session for user %d: %w", userID, result.Error)
	}

	// Encrypt credentials
	encAPIID, err := sm.encrypt(apiID)
	if err != nil {
		return fmt.Errorf("failed to encrypt API ID: %w", err)
	}

	encAPIHash, err := sm.encrypt(apiHash)
	if err != nil {
		return fmt.Errorf("failed to encrypt API Hash: %w", err)
	}

	encPhone, err := sm.encrypt(phone)
	if err != nil {
		return fmt.Errorf("failed to encrypt Phone: %w", err)
	}

	// Update session
	return sm.dbConn.Model(&session).Updates(map[string]interface{}{
		"encrypted_api_id":   encAPIID,
		"encrypted_api_hash": encAPIHash,
		"encrypted_phone":    encPhone,
	}).Error
}

// DeleteUserSession marks a user's session as inactive (soft delete)
func (sm *SessionManager) DeleteUserSession(userID int64) error {
	var session db.TDLibSession
	result := sm.dbConn.Where("user_id = ?", userID).First(&session)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return fmt.Errorf("no TDLib session for user %d", userID)
		}
		return fmt.Errorf("failed to fetch TDLib session for user %d: %w", userID, result.Error)
	}

	// Mark as inactive instead of hard delete
	return sm.dbConn.Model(&session).Update("active", false).Error
}

// encrypt encrypts plaintext using AES-256-GCM
func (sm *SessionManager) encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(sm.encryptionKey)
	if err != nil {
		return "", fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// decrypt decrypts ciphertext using AES-256-GCM
func (sm *SessionManager) decrypt(ciphertext string) (string, error) {
	ciphertextBytes, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	block, err := aes.NewCipher(sm.encryptionKey)
	if err != nil {
		return "", fmt.Errorf("failed to create AES cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertextBytes) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertextOnly := ciphertextBytes[:nonceSize], ciphertextBytes[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextOnly, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// validateAPIID validates API ID format (should be a 12-digit integer)
func validateAPIID(apiID string) error {
	if apiID == "" {
		return fmt.Errorf("api_id cannot be empty")
	}

	// API ID should be numeric and positive
	id, err := strconv.ParseInt(apiID, 10, 64)
	if err != nil {
		return fmt.Errorf("api_id must be a valid integer: %w", err)
	}

	if id <= 0 {
		return fmt.Errorf("api_id must be positive, got %d", id)
	}

	return nil
}

// validatePhone validates phone format (E.164: +{1-3 digits}{7-14 digits})
func validatePhone(phone string) error {
	if phone == "" {
		return fmt.Errorf("phone cannot be empty")
	}

	// E.164 format: + followed by 1-3 digit country code, then 7-14 digits
	pattern := `^\+[1-9]\d{1,14}$`
	if matched, _ := regexp.MatchString(pattern, phone); !matched {
		return fmt.Errorf("phone must be in E.164 format (e.g., +1234567890), got %s", phone)
	}

	return nil
}
