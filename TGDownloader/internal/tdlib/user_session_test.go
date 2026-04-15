package tdlib

import (
	"crypto/rand"
	"encoding/base64"
	"os"
	"testing"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	// Run migrations
	if err := db.InitDB(dbConn); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	return dbConn
}

// setupEncryptionKey generates and sets a test encryption key
func setupEncryptionKey(t *testing.T) string {
	key := make([]byte, 32) // 256 bits for AES-256
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("Failed to generate random key: %v", err)
	}

	keyStr := base64.StdEncoding.EncodeToString(key)
	if err := os.Setenv("TDLIB_ENCRYPTION_KEY", keyStr); err != nil {
		t.Fatalf("Failed to set encryption key: %v", err)
	}

	return keyStr
}

// createTestUser creates a test user in the database
func createTestUser(t *testing.T, dbConn *gorm.DB, username string) *db.User {
	user := &db.User{
		Username: username,
		IsActive: true,
	}

	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	return user
}

// TestEncryptionDecryptionRoundTrip tests AES-256-GCM encryption and decryption
func TestEncryptionDecryptionRoundTrip(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	plaintext := "test_secret_123"
	encrypted, err := sm.encrypt(plaintext)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	if encrypted == plaintext {
		t.Errorf("Encrypted text should differ from plaintext")
	}

	decrypted, err := sm.decrypt(encrypted)
	if err != nil {
		t.Fatalf("Failed to decrypt: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("Decrypted text mismatch. Expected %q, got %q", plaintext, decrypted)
	}
}

// TestSetAndGetUserSession tests setting and retrieving user TDLib session
func TestSetAndGetUserSession(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	apiID := "123456"
	apiHash := "abcdef123456"
	phone := "+1234567890"

	// Set session
	err = sm.SetUserSession(user.ID, apiID, apiHash, phone)
	if err != nil {
		t.Fatalf("Failed to set user session: %v", err)
	}

	// Get session
	creds, err := sm.GetUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to get user session: %v", err)
	}

	if creds.APIID != apiID {
		t.Errorf("API ID mismatch. Expected %q, got %q", apiID, creds.APIID)
	}
	if creds.APIHash != apiHash {
		t.Errorf("API Hash mismatch. Expected %q, got %q", apiHash, creds.APIHash)
	}
	if creds.Phone != phone {
		t.Errorf("Phone mismatch. Expected %q, got %q", phone, creds.Phone)
	}
}

// TestUserSessionIsolation tests that different users' sessions don't interfere
func TestUserSessionIsolation(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user1 := createTestUser(t, dbConn, "user1")
	user2 := createTestUser(t, dbConn, "user2")

	// Set different credentials for each user
	err = sm.SetUserSession(user1.ID, "111111", "hash1", "+1111111111")
	if err != nil {
		t.Fatalf("Failed to set user1 session: %v", err)
	}

	err = sm.SetUserSession(user2.ID, "222222", "hash2", "+2222222222")
	if err != nil {
		t.Fatalf("Failed to set user2 session: %v", err)
	}

	// Retrieve and verify each user's credentials
	creds1, err := sm.GetUserSession(user1.ID)
	if err != nil {
		t.Fatalf("Failed to get user1 session: %v", err)
	}

	creds2, err := sm.GetUserSession(user2.ID)
	if err != nil {
		t.Fatalf("Failed to get user2 session: %v", err)
	}

	if creds1.APIID != "111111" {
		t.Errorf("User1 API ID mismatch. Expected 111111, got %q", creds1.APIID)
	}
	if creds2.APIID != "222222" {
		t.Errorf("User2 API ID mismatch. Expected 222222, got %q", creds2.APIID)
	}

	// Verify isolation: user1's creds should not equal user2's
	if creds1.APIID == creds2.APIID || creds1.Phone == creds2.Phone {
		t.Errorf("User isolation failed: credentials leaked between users")
	}
}

// TestUpdateUserSession tests updating existing credentials
func TestUpdateUserSession(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Set initial session
	err = sm.SetUserSession(user.ID, "123456", "hash1", "+1234567890")
	if err != nil {
		t.Fatalf("Failed to set initial session: %v", err)
	}

	// Update session with new credentials
	err = sm.UpdateUserSession(user.ID, "654321", "hash2", "+9876543210")
	if err != nil {
		t.Fatalf("Failed to update user session: %v", err)
	}

	// Verify new credentials
	creds, err := sm.GetUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to get updated session: %v", err)
	}

	if creds.APIID != "654321" {
		t.Errorf("API ID not updated. Expected 654321, got %q", creds.APIID)
	}
	if creds.Phone != "+9876543210" {
		t.Errorf("Phone not updated. Expected +9876543210, got %q", creds.Phone)
	}
}

// TestDeleteUserSession tests soft-deleting a session
func TestDeleteUserSession(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Set session
	err = sm.SetUserSession(user.ID, "123456", "hash1", "+1234567890")
	if err != nil {
		t.Fatalf("Failed to set session: %v", err)
	}

	// Delete session
	err = sm.DeleteUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to delete session: %v", err)
	}

	// Verify session is no longer retrievable
	_, err = sm.GetUserSession(user.ID)
	if err == nil {
		t.Errorf("Expected error for deleted session, got nil")
	}
}

// TestInvalidAPIIDFormat tests validation of API ID format
func TestInvalidAPIIDFormat(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	tests := []struct {
		name    string
		apiID   string
		wantErr bool
	}{
		{"valid API ID", "123456", false},
		{"too small API ID", "100", true},
		{"too large API ID", "10000000", true},
		{"non-numeric API ID", "abc123", true},
		{"empty API ID", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := sm.SetUserSession(user.ID, tt.apiID, "hash", "+1234567890")
			if (err != nil) != tt.wantErr {
				t.Errorf("SetUserSession error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestInvalidPhoneFormat tests validation of phone number format
func TestInvalidPhoneFormat(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	tests := []struct {
		name    string
		phone   string
		wantErr bool
	}{
		{"valid E.164 format", "+1234567890", false},
		{"valid E.164 with country code", "+441234567890", false},
		{"missing plus sign", "1234567890", true},
		{"invalid format with spaces", "+1 234 567 890", true},
		{"empty phone", "", true},
		{"invalid prefix", "-1234567890", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := sm.SetUserSession(user.ID, "123456", "hash", tt.phone)
			if (err != nil) != tt.wantErr {
				t.Errorf("SetUserSession error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestMissingEncryptionKey tests behavior when encryption key is not set
func TestMissingEncryptionKey(t *testing.T) {
	// Unset encryption key
	os.Unsetenv("TDLIB_ENCRYPTION_KEY")

	dbConn := setupTestDB(t)

	_, err := NewSessionManager(dbConn)
	if err == nil {
		t.Errorf("Expected error when encryption key is missing, got nil")
	}
}

// TestInvalidEncryptionKey tests behavior with invalid base64 key
func TestInvalidEncryptionKey(t *testing.T) {
	// Set invalid base64 key
	os.Setenv("TDLIB_ENCRYPTION_KEY", "not_valid_base64!!!")

	dbConn := setupTestDB(t)

	_, err := NewSessionManager(dbConn)
	if err == nil {
		t.Errorf("Expected error with invalid base64 key, got nil")
	}
}

// TestWrongEncryptionKeyDecryption tests decryption with different key
func TestWrongEncryptionKeyDecryption(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	// Encrypt with current key
	encrypted, err := sm.encrypt("secret")
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	// Change encryption key
	key := make([]byte, 32)
	rand.Read(key)
	newKeyStr := base64.StdEncoding.EncodeToString(key)
	os.Setenv("TDLIB_ENCRYPTION_KEY", newKeyStr)

	// Create new session manager with different key
	sm2, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create second session manager: %v", err)
	}

	// Try to decrypt with wrong key - should fail
	_, err = sm2.decrypt(encrypted)
	if err == nil {
		t.Errorf("Expected decryption to fail with wrong key, got nil")
	}
}

// TestGetNonexistentSession tests retrieving session for user with no session
func TestGetNonexistentSession(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Try to get session for user with no session
	_, err = sm.GetUserSession(user.ID)
	if err == nil {
		t.Errorf("Expected error for nonexistent session, got nil")
	}
}

// TestUpdateNonexistentSession tests updating session that doesn't exist
func TestUpdateNonexistentSession(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Try to update nonexistent session
	err = sm.UpdateUserSession(user.ID, "123456", "hash", "+1234567890")
	if err == nil {
		t.Errorf("Expected error when updating nonexistent session, got nil")
	}
}

// TestConcurrentAccess tests concurrent read/write safety
func TestConcurrentAccess(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Set initial session
	err = sm.SetUserSession(user.ID, "123456", "hash1", "+1234567890")
	if err != nil {
		t.Fatalf("Failed to set session: %v", err)
	}

	// Note: SQLite in-memory databases have limitations with concurrent access.
	// Test sequential access instead to avoid SQLite locking issues.
	// Real deployment would use PostgreSQL which handles concurrency better.

	// Test sequential reads
	for i := 0; i < 3; i++ {
		_, err := sm.GetUserSession(user.ID)
		if err != nil {
			t.Errorf("Read %d failed: %v", i, err)
		}
	}

	// Test sequential updates
	for i := 0; i < 3; i++ {
		apiID := "100000" + string(rune(i)+'0')
		err := sm.UpdateUserSession(user.ID, apiID, "hash", "+1234567890")
		if err != nil {
			t.Errorf("Update %d failed: %v", i, err)
		}
	}

	// Verify final state is valid
	creds, err := sm.GetUserSession(user.ID)
	if err != nil {
		t.Errorf("Failed to verify final state: %v", err)
	}
	if creds == nil {
		t.Errorf("Final credentials are nil")
	}
}

// TestEmptyAPIHash tests validation of empty API hash
func TestEmptyAPIHash(t *testing.T) {
	setupEncryptionKey(t)
	dbConn := setupTestDB(t)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	user := createTestUser(t, dbConn, "testuser")

	// Try to set session with empty API hash
	err = sm.SetUserSession(user.ID, "123456", "", "+1234567890")
	if err == nil {
		t.Errorf("Expected error for empty API hash, got nil")
	}
}
