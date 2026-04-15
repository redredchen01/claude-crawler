package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

// TestMultiKeyIntegration tests the complete multi-key workflow
func TestMultiKeyIntegration(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// 1. Create user
	user, err := um.CreateUser("integration_test_user")
	require.NoError(t, err)
	assert.Equal(t, "integration_test_user", user.Username)

	// 2. Generate multiple keys of different types
	apiKey1, err := km.CreateKeyWithType(user.ID, "api_prod", db.KeyTypeAPI)
	require.NoError(t, err)
	assert.NotEmpty(t, apiKey1)

	apiKey2, err := km.CreateKeyWithType(user.ID, "api_dev", db.KeyTypeAPI)
	require.NoError(t, err)
	assert.NotEmpty(t, apiKey2)

	webhookKey, err := km.CreateKeyWithType(user.ID, "webhook_prod", db.KeyTypeWebhook)
	require.NoError(t, err)
	assert.NotEmpty(t, webhookKey)

	// 3. Create middleware stack
	authHandler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Extract and verify context
				userID, keyID, keyType, limit, ok := WithKeyContext(r)
				if !ok {
					w.WriteHeader(http.StatusInternalServerError)
					return
				}

				// Response includes details
				w.Header().Set("X-User-ID", string(rune(userID)))
				w.Header().Set("X-Key-ID", string(rune(keyID)))
				w.Header().Set("X-Key-Type", string(keyType))
				w.Header().Set("X-Key-Limit", string(rune(limit)))
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// 4. Test API key 1 on /api/v1/ endpoint
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey1)
	w := httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "api", w.Header().Get("X-Key-Type"))

	// 5. Test API key 1 CANNOT access /webhook/ endpoint
	req = httptest.NewRequest("POST", "/webhook/verify", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey1)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)

	// 6. Test webhook key on /webhook/ endpoint
	req = httptest.NewRequest("POST", "/webhook/verify", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKey)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "webhook", w.Header().Get("X-Key-Type"))

	// 7. Test webhook key CANNOT access /api/v1/ endpoint
	req = httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKey)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)

	// 8. Revoke API key 1
	err = km.RevokeKey(1)
	require.NoError(t, err)

	// 9. Verify API key 1 no longer works
	req = httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey1)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	// 10. But API key 2 and webhook key still work
	req = httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey2)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	req = httptest.NewRequest("POST", "/webhook/verify", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKey)
	w = httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// 11. Verify independent rate limit buckets
	// Reset database to clear rate limits
	database.Exec("DELETE FROM rate_limits")

	// Make 10 requests with API key 2
	for i := 0; i < 10; i++ {
		req = httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey2)
		w = httptest.NewRecorder()
		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Make 10 requests with webhook key (should also work - independent bucket)
	for i := 0; i < 10; i++ {
		req = httptest.NewRequest("POST", "/webhook/verify", nil)
		req.Header.Set("Authorization", "Bearer "+webhookKey)
		w = httptest.NewRecorder()
		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Verify count: each key has independent bucket
	var rateLimits []db.RateLimit
	result := database.Where("key_id IS NOT NULL").Find(&rateLimits)
	require.NoError(t, result.Error)

	// Should have 2 rate limit buckets (one per key)
	assert.Len(t, rateLimits, 2)

	// Check counts
	var apiKeyCount, webhookKeyCount int
	for _, rl := range rateLimits {
		if *rl.KeyID == 2 { // API key 2
			apiKeyCount = rl.RequestsThisMin
		} else if *rl.KeyID == 3 { // Webhook key
			webhookKeyCount = rl.RequestsThisMin
		}
	}

	assert.Equal(t, 10, apiKeyCount)
	assert.Equal(t, 10, webhookKeyCount)
}

// TestMultiKeySecurityIsolation verifies that key compromise is isolated
func TestMultiKeySecurityIsolation(t *testing.T) {
	database := testutil.NewTestDB(t)
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Create user with API and webhook keys
	user, err := um.CreateUser("security_test_user")
	require.NoError(t, err)

	apiKey, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	webhookKey, err := km.CreateKeyWithType(user.ID, "webhook", db.KeyTypeWebhook)
	require.NoError(t, err)

	// Simulate: webhook key is compromised
	err = km.RevokeKey(2) // Revoke webhook key
	require.NoError(t, err)

	// Verify: API key still works (not affected by webhook key compromise)
	userID, _, keyType, err := km.ValidateKeyWithType(apiKey)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, userID)
	assert.Equal(t, db.KeyTypeAPI, keyType)

	// Verify: webhook key is now invalid
	_, _, _, err = km.ValidateKeyWithType(webhookKey)
	assert.Error(t, err)
}

// TestMultiKeyTypeValidation ensures keys cannot be used for wrong endpoints
func TestMultiKeyTypeValidation(t *testing.T) {
	endpoints := []struct {
		path    string
		apiOK   bool
		webhookOK bool
	}{
		{"/api/v1/tasks", true, false},
		{"/api/v1/tasks/123", true, false},
		{"/api/v1/download", true, false},
		{"/webhook/verify", false, true},
		{"/webhook/events", false, true},
		{"/webhook/retry", false, true},
		{"/admin/users", false, false},
		{"/health", false, false},
	}

	for _, ep := range endpoints {
		// Test API key
		result := isEndpointAllowedForKeyType(ep.path, db.KeyTypeAPI)
		assert.Equal(t, ep.apiOK, result,
			"API key on endpoint %s should be %v", ep.path, ep.apiOK)

		// Test webhook key
		result = isEndpointAllowedForKeyType(ep.path, db.KeyTypeWebhook)
		assert.Equal(t, ep.webhookOK, result,
			"Webhook key on endpoint %s should be %v", ep.path, ep.webhookOK)
	}
}

// TestRateLimitPersistence verifies that rate limit buckets track independently per key
func TestRateLimitPersistence(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("rate_limit_test_user")
	require.NoError(t, err)

	// Create two keys
	apiKey1, err := km.CreateKeyWithType(user.ID, "api1", db.KeyTypeAPI)
	require.NoError(t, err)

	apiKey2, err := km.CreateKeyWithType(user.ID, "api2", db.KeyTypeAPI)
	require.NoError(t, err)

	authHandler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Make 5 requests with key1
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey1)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Make 8 requests with key2 (different bucket)
	for i := 0; i < 8; i++ {
		req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey2)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Verify bucket states are independent
	var rateLimits []db.RateLimit
	result := database.Where("key_id IN (?, ?)", 1, 2).Find(&rateLimits)
	require.NoError(t, result.Error)
	assert.Len(t, rateLimits, 2)

	// Check counts
	for _, rl := range rateLimits {
		if *rl.KeyID == 1 {
			assert.Equal(t, 5, rl.RequestsThisMin)
		} else if *rl.KeyID == 2 {
			assert.Equal(t, 8, rl.RequestsThisMin)
		}
	}
}
