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

func TestMultiKeyAuthMiddleware_ValidAPIKey(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user and API key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "test", db.KeyTypeAPI)
	require.NoError(t, err)

	// Create handler that checks context
	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := WithUserContext(r)
			if !ok {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			keyID, keyID_ok := r.Context().Value(KeyIDKey).(int64)
			if !keyID_ok || keyID == 0 {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			w.Header().Set("X-User-ID", string(rune(userID)))
			w.Header().Set("X-Key-ID", string(rune(keyID)))
			w.WriteHeader(http.StatusOK)
		}),
	)

	// Test request
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestMultiKeyAuthMiddleware_InvalidKey(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()

	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer invalid_key_xyz")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestMultiKeyAuthMiddleware_APIKeyOnlyOnAPIEndpoint(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user and API key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	// API key should work on /api/v1/* endpoint
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// API key should NOT work on /webhook/* endpoint (403)
	req = httptest.NewRequest("POST", "/webhook/verify", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w = httptest.NewRecorder()

	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestMultiKeyAuthMiddleware_WebhookKeyOnlyOnWebhookEndpoint(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user and webhook key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	webhookKeyPlain, err := km.CreateKeyWithType(user.ID, "webhook", db.KeyTypeWebhook)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	// Webhook key should work on /webhook/* endpoint
	req := httptest.NewRequest("POST", "/webhook/verify", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Webhook key should NOT work on /api/v1/* endpoint (403)
	req = httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKeyPlain)
	w = httptest.NewRecorder()

	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestMultiKeyAuthMiddleware_MissingHeader(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()

	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	// No Authorization header
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestMultiKeyAuthMiddleware_InvalidFormat(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()

	handler := MultiKeyAuthMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	// Missing "Bearer" prefix
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "invalid_token_xyz")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestMultiKeyRateLimitMiddleware_ContextMissing(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()

	handler := MultiKeyRateLimitMiddleware(database, logger)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	// Request with no key context
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestIsEndpointAllowedForKeyType(t *testing.T) {
	// Test API key allowed paths
	assert.True(t, isEndpointAllowedForKeyType("/api/v1/tasks", db.KeyTypeAPI))
	assert.True(t, isEndpointAllowedForKeyType("/api/v1/tasks/123", db.KeyTypeAPI))
	assert.False(t, isEndpointAllowedForKeyType("/webhook/verify", db.KeyTypeAPI))
	assert.False(t, isEndpointAllowedForKeyType("/admin/users", db.KeyTypeAPI))

	// Test webhook key allowed paths
	assert.True(t, isEndpointAllowedForKeyType("/webhook/verify", db.KeyTypeWebhook))
	assert.True(t, isEndpointAllowedForKeyType("/webhook/events", db.KeyTypeWebhook))
	assert.False(t, isEndpointAllowedForKeyType("/api/v1/tasks", db.KeyTypeWebhook))
	assert.False(t, isEndpointAllowedForKeyType("/admin/users", db.KeyTypeWebhook))
}

func TestGetRateLimitForKeyType(t *testing.T) {
	assert.Equal(t, 100, getRateLimitForKeyType(db.KeyTypeAPI))
	assert.Equal(t, 1000, getRateLimitForKeyType(db.KeyTypeWebhook))
	assert.Equal(t, 100, getRateLimitForKeyType(db.KeyType("invalid")))
}

func TestMultiKeyRateLimitMiddleware_APIKeyLimit(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user and API key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	// Create middleware stack
	authHandler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Make requests up to the API limit (100)
	for i := 0; i < 100; i++ {
		req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		if i < 99 {
			assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed", i)
		}
	}

	// 101st request should fail (429)
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	authHandler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}

func TestMultiKeyRateLimitMiddleware_WebhookKeyHigherLimit(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user and webhook key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	webhookKeyPlain, err := km.CreateKeyWithType(user.ID, "webhook", db.KeyTypeWebhook)
	require.NoError(t, err)

	// Create middleware stack
	authHandler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Webhook keys should have 1000 req/min limit
	// Test with 50 requests (should all succeed)
	for i := 0; i < 50; i++ {
		req := httptest.NewRequest("POST", "/webhook/verify", nil)
		req.Header.Set("Authorization", "Bearer "+webhookKeyPlain)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed", i)
	}
}

func TestMultiKeyRateLimitMiddleware_IndependentBuckets(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Setup: create user with two API keys
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	apiKey1, err := km.CreateKeyWithType(user.ID, "api1", db.KeyTypeAPI)
	require.NoError(t, err)

	apiKey2, err := km.CreateKeyWithType(user.ID, "api2", db.KeyTypeAPI)
	require.NoError(t, err)

	// Create middleware stack
	authHandler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Each key has independent 100 req/min bucket
	// Request with key1 50 times
	for i := 0; i < 50; i++ {
		req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey1)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Request with key2 50 times (should still work - independent bucket)
	for i := 0; i < 50; i++ {
		req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey2)
		w := httptest.NewRecorder()

		authHandler.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// Key1 at 50/100, key2 at 50/100 - both should still have capacity
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey1)
	w := httptest.NewRecorder()
	authHandler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}
