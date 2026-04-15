package auth

import (
	"testing"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupIntegrationDB(t *testing.T) *gorm.DB {
	// Use in-memory SQLite for testing
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	// Run migrations
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	return database
}

func TestEndToEndUserAndKeyCreation(t *testing.T) {
	database := setupIntegrationDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Step 1: Create a user
	user, err := um.CreateUser("test_user")
	assert.NoError(t, err)
	assert.NotNil(t, user)
	assert.Equal(t, "test_user", user.Username)

	// Step 2: Generate an API key for the user
	key, err := km.CreateKey(user.ID, "test_key_1")
	assert.NoError(t, err)
	assert.NotEmpty(t, key)

	// Step 3: Validate the key works
	userID, err := km.ValidateKey(key)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)

	// Step 4: Verify we can retrieve the user by key validation
	retrievedUser, err := um.GetUser(userID)
	assert.NoError(t, err)
	assert.Equal(t, "test_user", retrievedUser.Username)

	// Step 5: Generate a second key for the same user
	key2, err := km.CreateKey(user.ID, "test_key_2")
	assert.NoError(t, err)
	assert.NotEmpty(t, key2)
	assert.NotEqual(t, key, key2)

	// Step 6: Both keys should validate
	userID1, err := km.ValidateKey(key)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID1)

	userID2, err := km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID2)

	// Step 7: List all keys for the user
	keys, err := km.ListUserKeys(user.ID)
	assert.NoError(t, err)
	assert.Len(t, keys, 2)

	// Step 8: Revoke the first key
	apiKey1, err := km.GetKey(1)
	assert.NoError(t, err)
	err = km.RevokeKey(apiKey1.ID)
	assert.NoError(t, err)

	// Step 9: First key should no longer validate
	_, err = km.ValidateKey(key)
	assert.Error(t, err)

	// Step 10: Second key should still work
	userID2, err = km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID2)

	// Step 11: Rotate the second key
	newKey, err := km.RotateKey(apiKey1.ID+1, "test_key_2_rotated")
	assert.NoError(t, err)
	assert.NotEmpty(t, newKey)
	assert.NotEqual(t, key2, newKey)

	// Step 12: Old key should be revoked
	_, err = km.ValidateKey(key2)
	assert.Error(t, err)

	// Step 13: New key should work
	userID3, err := km.ValidateKey(newKey)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID3)
}

func TestMultipleKeyValidation(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	// Run migrations
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user and keys
	user, err := um.CreateUser("multi_key_user")
	assert.NoError(t, err)

	key1, err := km.CreateKey(user.ID, "key1")
	assert.NoError(t, err)

	key2, err := km.CreateKey(user.ID, "key2")
	assert.NoError(t, err)

	key3, err := km.CreateKey(user.ID, "key3")
	assert.NoError(t, err)

	// Validate all keys sequentially
	for _, key := range []string{key1, key2, key3} {
		uid, err := km.ValidateKey(key)
		assert.NoError(t, err)
		assert.Equal(t, user.ID, uid)
	}

	// Revoke key1 and verify it no longer validates
	err = km.RevokeKey(1)
	assert.NoError(t, err)

	_, err = km.ValidateKey(key1)
	assert.Error(t, err)

	// Verify other keys still work
	uid2, err := km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, uid2)

	uid3, err := km.ValidateKey(key3)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, uid3)
}

func TestKeyDeterminism(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user
	user, err := um.CreateUser("determinism_user")
	assert.NoError(t, err)

	// Generate two keys
	key1, err := km.CreateKey(user.ID, "key1")
	assert.NoError(t, err)

	key2, err := km.CreateKey(user.ID, "key2")
	assert.NoError(t, err)

	// Keys should be different (due to randomness in generation)
	assert.NotEqual(t, key1, key2, "two generated keys should differ")

	// But both should validate to the same user
	uid1, _ := km.ValidateKey(key1)
	uid2, _ := km.ValidateKey(key2)
	assert.Equal(t, uid1, uid2)
	assert.Equal(t, user.ID, uid1)

	// Hash verification should work: multiple hashes of the same key should all verify
	hash1, _ := HashKey(key1)
	hash2, _ := HashKey(key1)
	hash3, _ := HashKey(key1)

	assert.NotEqual(t, hash1, hash2, "different bcrypt hashes for same key (salt)")
	assert.NotEqual(t, hash2, hash3, "different bcrypt hashes for same key (salt)")

	// All should verify the key
	assert.True(t, VerifyKey(key1, hash1))
	assert.True(t, VerifyKey(key1, hash2))
	assert.True(t, VerifyKey(key1, hash3))
}

func TestMultiUserKeyIsolation(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create two users
	user1, err := um.CreateUser("user1")
	assert.NoError(t, err)

	user2, err := um.CreateUser("user2")
	assert.NoError(t, err)

	// Create keys for each user
	key1, err := km.CreateKey(user1.ID, "key_for_user1")
	assert.NoError(t, err)

	key2, err := km.CreateKey(user2.ID, "key_for_user2")
	assert.NoError(t, err)

	// Validate that keys belong to correct users
	uid1, err := km.ValidateKey(key1)
	assert.NoError(t, err)
	assert.Equal(t, user1.ID, uid1)

	uid2, err := km.ValidateKey(key2)
	assert.NoError(t, err)
	assert.Equal(t, user2.ID, uid2)

	// Keys should not be interchangeable
	assert.NotEqual(t, uid1, uid2)

	// Each user should have only their own keys
	user1Keys, err := km.ListUserKeys(user1.ID)
	assert.NoError(t, err)
	assert.Len(t, user1Keys, 1)
	assert.Equal(t, "key_for_user1", user1Keys[0].Name)

	user2Keys, err := km.ListUserKeys(user2.ID)
	assert.NoError(t, err)
	assert.Len(t, user2Keys, 1)
	assert.Equal(t, "key_for_user2", user2Keys[0].Name)
}

func TestUserDeactivationBehavior(t *testing.T) {
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)
	err = database.AutoMigrate(&db.User{}, &db.APIKey{})
	assert.NoError(t, err)

	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user with key
	user, err := um.CreateUser("deactivate_user")
	assert.NoError(t, err)

	key, err := km.CreateKey(user.ID, "test_key")
	assert.NoError(t, err)

	// Key should validate before deactivation
	uid, err := km.ValidateKey(key)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, uid)

	// Deactivate user
	err = um.DeactivateUser(user.ID)
	assert.NoError(t, err)

	// Key validation should fail after deactivation (user is invalid)
	_, err = km.ValidateKey(key)
	assert.Error(t, err, "key validation should fail for deactivated user")
}
