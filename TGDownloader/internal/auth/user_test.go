package auth

import (
	"testing"
	"time"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	// Use in-memory SQLite for testing
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	// Run migrations
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	return database
}

func TestValidateUsername(t *testing.T) {
	tests := []struct {
		name      string
		username  string
		shouldErr bool
	}{
		{"valid simple", "alice", false},
		{"valid with underscore", "alice_123", false},
		{"valid mixed case", "Alice_Bob", false},
		{"too short", "ab", true},
		{"too long", "a" + string(make([]byte, 100)), true},
		{"with space", "alice bob", true},
		{"with dash", "alice-bob", true},
		{"with special char", "alice@bob", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateUsername(tt.username)
			if tt.shouldErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestCreateUser(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)

	// Test successful creation
	user, err := um.CreateUser("alice")
	assert.NoError(t, err)
	assert.NotNil(t, user)
	assert.Equal(t, "alice", user.Username)
	assert.True(t, user.IsActive)
	assert.Nil(t, user.DeletedAt)

	// Test duplicate username
	_, err = um.CreateUser("alice")
	assert.Error(t, err)

	// Test invalid username
	_, err = um.CreateUser("ab")
	assert.Error(t, err)
}

func TestGetUser(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)

	// Create a user
	user, err := um.CreateUser("bob")
	assert.NoError(t, err)

	// Retrieve by ID
	retrieved, err := um.GetUser(user.ID)
	assert.NoError(t, err)
	assert.Equal(t, "bob", retrieved.Username)

	// Non-existent user
	_, err = um.GetUser(99999)
	assert.Error(t, err)
}

func TestGetUserByUsername(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)

	// Create a user
	user, err := um.CreateUser("charlie")
	assert.NoError(t, err)

	// Retrieve by username
	retrieved, err := um.GetUserByUsername("charlie")
	assert.NoError(t, err)
	assert.Equal(t, user.ID, retrieved.ID)

	// Non-existent user
	_, err = um.GetUserByUsername("nonexistent")
	assert.Error(t, err)
}

func TestListUsers(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)

	// Create multiple users
	for i := 0; i < 3; i++ {
		_, err := um.CreateUser("user" + string(rune('0'+i)))
		assert.NoError(t, err)
	}

	// List all users
	users, err := um.ListUsers()
	assert.NoError(t, err)
	assert.Len(t, users, 3)
}

func TestDeactivateUser(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)

	// Create user
	user, err := um.CreateUser("dave")
	assert.NoError(t, err)

	// Deactivate
	err = um.DeactivateUser(user.ID)
	assert.NoError(t, err)

	// Verify user is deactivated
	_, err = um.GetUser(user.ID)
	assert.Error(t, err) // Should not be found since it's deleted

	// Verify user is marked as deactivated in DB
	var dbUser db.User
	database.Unscoped().First(&dbUser, user.ID)
	assert.False(t, dbUser.IsActive)
	assert.NotNil(t, dbUser.DeletedAt)
}

func TestCreateKey(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user first
	user, err := um.CreateUser("eve")
	assert.NoError(t, err)

	// Create key
	key, err := km.CreateKey(user.ID, "prod_key_1")
	assert.NoError(t, err)
	assert.NotEmpty(t, key)

	// Verify key can be retrieved
	retrieved, err := km.GetKey(1)
	assert.NoError(t, err)
	assert.Equal(t, "prod_key_1", retrieved.Name)
	assert.False(t, retrieved.IsRevoked)

	// Try to create key for non-existent user
	_, err = km.CreateKey(99999, "invalid_key")
	assert.Error(t, err)
}

func TestValidateKey(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user and key
	user, err := um.CreateUser("frank")
	assert.NoError(t, err)

	key, err := km.CreateKey(user.ID, "test_key")
	assert.NoError(t, err)

	// Validate correct key
	userID, err := km.ValidateKey(key)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)

	// Verify last_used_at was updated
	apiKey, err := km.GetKey(1)
	assert.NoError(t, err)
	assert.NotNil(t, apiKey.LastUsedAt)

	// Validate incorrect key
	_, err = km.ValidateKey("invalid_key_value")
	assert.Error(t, err)

	// Validate empty key
	_, err = km.ValidateKey("")
	assert.Error(t, err)

	// Revoke key and try to validate
	err = km.RevokeKey(1)
	assert.NoError(t, err)

	_, err = km.ValidateKey(key)
	assert.Error(t, err, "revoked key should not validate")
}

func TestRevokeKey(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user and key
	user, err := um.CreateUser("grace")
	assert.NoError(t, err)

	key, err := km.CreateKey(user.ID, "revokable_key")
	assert.NoError(t, err)

	// Revoke key
	err = km.RevokeKey(1)
	assert.NoError(t, err)

	// Verify key is revoked
	apiKey, err := km.GetKey(1)
	assert.NoError(t, err)
	assert.True(t, apiKey.IsRevoked)

	// Verify validation fails
	_, err = km.ValidateKey(key)
	assert.Error(t, err)
}

func TestRotateKey(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user and key
	user, err := um.CreateUser("henry")
	assert.NoError(t, err)

	oldKey, err := km.CreateKey(user.ID, "old_key")
	assert.NoError(t, err)

	// Rotate key
	newKey, err := km.RotateKey(1, "new_key")
	assert.NoError(t, err)
	assert.NotEmpty(t, newKey)
	assert.NotEqual(t, oldKey, newKey)

	// Verify old key is revoked
	oldKeyObj, err := km.GetKey(1)
	assert.NoError(t, err)
	assert.True(t, oldKeyObj.IsRevoked)

	// Verify old key doesn't validate
	_, err = km.ValidateKey(oldKey)
	assert.Error(t, err)

	// Verify new key validates
	userID, err := km.ValidateKey(newKey)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
}

func TestListUserKeys(t *testing.T) {
	database := setupTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user and multiple keys
	user, err := um.CreateUser("iris")
	assert.NoError(t, err)

	_, err = km.CreateKey(user.ID, "key1")
	assert.NoError(t, err)

	key2, err := km.CreateKey(user.ID, "key2")
	assert.NoError(t, err)

	// Revoke one key
	err = km.RevokeKey(1)
	assert.NoError(t, err)

	// List keys - should only return non-revoked
	keys, err := km.ListUserKeys(user.ID)
	assert.NoError(t, err)
	assert.Len(t, keys, 1)
	assert.Equal(t, "key2", keys[0].Name)

	// Validate second key still works
	userID, err := km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
}

func TestKeyExpiration(t *testing.T) {
	database := setupTestDB(t)
	km := NewKeyManager(database)
	um := NewUserManager(database)

	// Create user and key
	user, err := um.CreateUser("jack")
	assert.NoError(t, err)

	key, err := km.CreateKey(user.ID, "expiring_key")
	assert.NoError(t, err)

	// Set expiration in the past
	pastTime := time.Now().Add(-1 * time.Hour)
	err = database.Model(&db.APIKey{}).Where("id = ?", 1).Update("expires_at", pastTime).Error
	assert.NoError(t, err)

	// Validation should fail
	_, err = km.ValidateKey(key)
	assert.Error(t, err, "expired key should not validate")

	// Create another key with future expiration
	key2, err := km.CreateKey(user.ID, "valid_key")
	assert.NoError(t, err)

	futureTime := time.Now().Add(1 * time.Hour)
	err = database.Model(&db.APIKey{}).Where("id = ?", 2).Update("expires_at", futureTime).Error
	assert.NoError(t, err)

	// This one should validate
	userID, err := km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
}
