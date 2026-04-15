package tdlib

import (
	"os"
	"testing"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestIntegrationUserSessionWorkflow demonstrates end-to-end usage of session manager
// This test simulates: user creation -> TDLib session setup -> credential retrieval
func TestIntegrationUserSessionWorkflow(t *testing.T) {
	// Setup encryption key
	setupEncryptionKey(t)
	defer func() {
		os.Unsetenv("TDLIB_ENCRYPTION_KEY")
	}()

	// Create in-memory database
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	// Run migrations
	if err := db.InitDB(dbConn); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	// Create user
	user := &db.User{
		Username: "alice",
		IsActive: true,
	}
	if err := dbConn.Create(user).Error; err != nil {
		t.Fatalf("Failed to create user: %v", err)
	}

	// Initialize session manager
	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	// Step 1: User registers their TDLib credentials
	apiID := "123456"
	apiHash := "abcdef0123456789"
	phone := "+1234567890"

	err = sm.SetUserSession(user.ID, apiID, apiHash, phone)
	if err != nil {
		t.Fatalf("Failed to set TDLib credentials: %v", err)
	}

	// Step 2: Verify credentials are encrypted in database
	var sessionRecord db.TDLibSession
	if err := dbConn.Where("user_id = ?", user.ID).First(&sessionRecord).Error; err != nil {
		t.Fatalf("Failed to retrieve session from database: %v", err)
	}

	// Encrypted credentials should be different from plaintext
	if sessionRecord.EncryptedAPIID == apiID {
		t.Errorf("API ID should be encrypted, got plaintext")
	}
	if sessionRecord.EncryptedAPIHash == apiHash {
		t.Errorf("API Hash should be encrypted, got plaintext")
	}
	if sessionRecord.EncryptedPhone == phone {
		t.Errorf("Phone should be encrypted, got plaintext")
	}

	// Step 3: Retrieve and decrypt credentials
	creds, err := sm.GetUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to get user session: %v", err)
	}

	// Verify decrypted values match original
	if creds.APIID != apiID {
		t.Errorf("Decrypted API ID mismatch. Expected %q, got %q", apiID, creds.APIID)
	}
	if creds.APIHash != apiHash {
		t.Errorf("Decrypted API Hash mismatch. Expected %q, got %q", apiHash, creds.APIHash)
	}
	if creds.Phone != phone {
		t.Errorf("Decrypted phone mismatch. Expected %q, got %q", phone, creds.Phone)
	}

	// Step 4: Update credentials (e.g., new phone number)
	newPhone := "+9876543210"
	err = sm.UpdateUserSession(user.ID, apiID, apiHash, newPhone)
	if err != nil {
		t.Fatalf("Failed to update credentials: %v", err)
	}

	// Verify update
	updatedCreds, err := sm.GetUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to get updated session: %v", err)
	}

	if updatedCreds.Phone != newPhone {
		t.Errorf("Phone not updated. Expected %q, got %q", newPhone, updatedCreds.Phone)
	}

	// Step 5: Deactivate session
	err = sm.DeleteUserSession(user.ID)
	if err != nil {
		t.Fatalf("Failed to delete session: %v", err)
	}

	// Verify session is no longer accessible
	_, err = sm.GetUserSession(user.ID)
	if err == nil {
		t.Errorf("Expected error after deleting session, got nil")
	}
}

// TestIntegrationMultipleUserIsolation demonstrates user isolation
// Two users can have separate TDLib sessions without interference
func TestIntegrationMultipleUserIsolation(t *testing.T) {
	setupEncryptionKey(t)
	defer func() {
		os.Unsetenv("TDLIB_ENCRYPTION_KEY")
	}()

	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	if err := db.InitDB(dbConn); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	// Create two users
	user1 := &db.User{Username: "alice", IsActive: true}
	user2 := &db.User{Username: "bob", IsActive: true}

	dbConn.Create(user1)
	dbConn.Create(user2)

	sm, err := NewSessionManager(dbConn)
	if err != nil {
		t.Fatalf("Failed to create session manager: %v", err)
	}

	// Set different credentials for each user
	sm.SetUserSession(user1.ID, "111111", "alice_hash", "+1111111111")
	sm.SetUserSession(user2.ID, "222222", "bob_hash", "+2222222222")

	// Verify user1's session
	creds1, err := sm.GetUserSession(user1.ID)
	if err != nil {
		t.Fatalf("Failed to get user1 session: %v", err)
	}

	if creds1.APIID != "111111" {
		t.Errorf("User1 API ID mismatch. Expected 111111, got %q", creds1.APIID)
	}

	// Verify user2's session
	creds2, err := sm.GetUserSession(user2.ID)
	if err != nil {
		t.Fatalf("Failed to get user2 session: %v", err)
	}

	if creds2.APIID != "222222" {
		t.Errorf("User2 API ID mismatch. Expected 222222, got %q", creds2.APIID)
	}

	// Verify they're different (isolation)
	if creds1.APIID == creds2.APIID {
		t.Errorf("User isolation failed: both users have same API ID")
	}

	// Delete user1's session - user2's should still be accessible
	sm.DeleteUserSession(user1.ID)

	_, err = sm.GetUserSession(user1.ID)
	if err == nil {
		t.Errorf("User1 session should be deleted")
	}

	creds2Again, err := sm.GetUserSession(user2.ID)
	if err != nil {
		t.Errorf("User2 session should still be accessible after user1 deletion: %v", err)
	}

	if creds2Again.APIID != "222222" {
		t.Errorf("User2 session corrupted after user1 deletion")
	}
}
