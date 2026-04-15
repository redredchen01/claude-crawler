package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

func TestCreateKeyWithType(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create test user
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Test generating API key
	apiKey, err := km.CreateKeyWithType(user.ID, "api_key_1", db.KeyTypeAPI)
	assert.NoError(t, err)
	assert.NotEmpty(t, apiKey)

	// Verify it's stored correctly
	storedKey, err := km.GetKey(1)
	require.NoError(t, err)
	assert.Equal(t, db.KeyTypeAPI, db.KeyType(storedKey.KeyType))
	assert.Equal(t, "api_key_1", storedKey.Name)

	// Test generating webhook key
	webhookKey, err := km.CreateKeyWithType(user.ID, "webhook_key_1", db.KeyTypeWebhook)
	assert.NoError(t, err)
	assert.NotEmpty(t, webhookKey)

	// Verify it's stored correctly
	storedKey2, err := km.GetKey(2)
	require.NoError(t, err)
	assert.Equal(t, db.KeyTypeWebhook, db.KeyType(storedKey2.KeyType))
	assert.Equal(t, "webhook_key_1", storedKey2.Name)

	// Keys should be different
	assert.NotEqual(t, apiKey, webhookKey)
}

func TestCreateKeyWithInvalidType(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create test user
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Try to create with invalid type
	_, err = km.CreateKeyWithType(user.ID, "bad_key", db.KeyType("invalid"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid key type")
}

func TestValidateKeyWithType(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create test user
	user, err := um.CreateUser("alice")
	require.NoError(t, err)

	// Generate API key
	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api_key", db.KeyTypeAPI)
	require.NoError(t, err)

	// Generate webhook key
	webhookKeyPlain, err := km.CreateKeyWithType(user.ID, "webhook_key", db.KeyTypeWebhook)
	require.NoError(t, err)

	// Validate API key
	userID, keyID, keyType, err := km.ValidateKeyWithType(apiKeyPlain)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
	assert.Equal(t, int64(1), keyID)
	assert.Equal(t, db.KeyTypeAPI, keyType)

	// Validate webhook key
	userID, keyID, keyType, err = km.ValidateKeyWithType(webhookKeyPlain)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
	assert.Equal(t, int64(2), keyID)
	assert.Equal(t, db.KeyTypeWebhook, keyType)

	// Invalid key should fail
	_, _, _, err = km.ValidateKeyWithType("invalid_key_xyz")
	assert.Error(t, err)
}

func TestMultipleKeysPerUserIndependent(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user with multiple keys
	user, err := um.CreateUser("bob")
	require.NoError(t, err)

	// Generate 3 API keys and 2 webhook keys
	apiKeys := []string{}
	for i := 0; i < 3; i++ {
		key, err := km.CreateKeyWithType(user.ID, "api_key_"+string(rune(48+i)), db.KeyTypeAPI)
		assert.NoError(t, err)
		apiKeys = append(apiKeys, key)
	}

	webhookKeys := []string{}
	for i := 0; i < 2; i++ {
		key, err := km.CreateKeyWithType(user.ID, "webhook_key_"+string(rune(48+i)), db.KeyTypeWebhook)
		assert.NoError(t, err)
		webhookKeys = append(webhookKeys, key)
	}

	// All keys should be different
	allKeys := append(apiKeys, webhookKeys...)
	for i := 0; i < len(allKeys); i++ {
		for j := i + 1; j < len(allKeys); j++ {
			assert.NotEqual(t, allKeys[i], allKeys[j])
		}
	}

	// Each key should validate independently
	for i, key := range apiKeys {
		userID, retrievedKeyID, keyType, err := km.ValidateKeyWithType(key)
		assert.NoError(t, err)
		assert.Equal(t, user.ID, userID)
		assert.Equal(t, int64(i+1), retrievedKeyID) // First 3 keys are API
		assert.Equal(t, db.KeyTypeAPI, keyType)
	}

	for i, key := range webhookKeys {
		userID, retrievedKeyID, keyType, err := km.ValidateKeyWithType(key)
		assert.NoError(t, err)
		assert.Equal(t, user.ID, userID)
		assert.Equal(t, int64(i+4), retrievedKeyID) // Keys 4-5 are webhook
		assert.Equal(t, db.KeyTypeWebhook, keyType)
	}
}

func TestRevokeOneKeyDoesNotAffectOthers(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user with multiple keys
	user, err := um.CreateUser("charlie")
	require.NoError(t, err)

	apiKey1, err := km.CreateKeyWithType(user.ID, "api_1", db.KeyTypeAPI)
	require.NoError(t, err)

	apiKey2, err := km.CreateKeyWithType(user.ID, "api_2", db.KeyTypeAPI)
	require.NoError(t, err)

	// Revoke first key
	err = km.RevokeKey(1)
	assert.NoError(t, err)

	// First key should fail
	_, _, _, err = km.ValidateKeyWithType(apiKey1)
	assert.Error(t, err)

	// Second key should still work
	userID, keyID, keyType, err := km.ValidateKeyWithType(apiKey2)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
	assert.Equal(t, int64(2), keyID)
	assert.Equal(t, db.KeyTypeAPI, keyType)
}

func TestWebhookKeyCompromisedDoesNotAffectAPI(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user
	user, err := um.CreateUser("dave")
	require.NoError(t, err)

	// Generate API and webhook keys
	apiKey, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	webhookKey, err := km.CreateKeyWithType(user.ID, "webhook", db.KeyTypeWebhook)
	require.NoError(t, err)

	// Simulate webhook key compromise by revoking it
	err = km.RevokeKey(2)
	assert.NoError(t, err)

	// API key should still work
	userID, _, keyType, err := km.ValidateKeyWithType(apiKey)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
	assert.Equal(t, db.KeyTypeAPI, keyType)

	// Webhook key should be invalid
	_, _, _, err = km.ValidateKeyWithType(webhookKey)
	assert.Error(t, err)
}

func TestListUserKeysShowsType(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user with mixed key types
	user, err := um.CreateUser("eve")
	require.NoError(t, err)

	_, err = km.CreateKeyWithType(user.ID, "api_1", db.KeyTypeAPI)
	assert.NoError(t, err)

	_, err = km.CreateKeyWithType(user.ID, "webhook_1", db.KeyTypeWebhook)
	assert.NoError(t, err)

	_, err = km.CreateKeyWithType(user.ID, "api_2", db.KeyTypeAPI)
	assert.NoError(t, err)

	// List keys
	keys, err := km.ListUserKeys(user.ID)
	require.NoError(t, err)
	assert.Len(t, keys, 3)

	// Check types
	apiCount := 0
	webhookCount := 0
	for _, k := range keys {
		if k.KeyType == string(db.KeyTypeAPI) {
			apiCount++
		} else if k.KeyType == string(db.KeyTypeWebhook) {
			webhookCount++
		}
	}

	assert.Equal(t, 2, apiCount)
	assert.Equal(t, 1, webhookCount)
}

func TestDefaultKeyTypeIsAPI(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := NewUserManager(database)
	km := NewKeyManager(database)

	// Create user
	user, err := um.CreateUser("frank")
	require.NoError(t, err)

	// Use legacy CreateKey (should default to API)
	key, err := km.CreateKey(user.ID, "default_key")
	require.NoError(t, err)

	// Verify it's API type
	_, _, keyType, err := km.ValidateKeyWithType(key)
	assert.NoError(t, err)
	assert.Equal(t, db.KeyTypeAPI, keyType)
}
