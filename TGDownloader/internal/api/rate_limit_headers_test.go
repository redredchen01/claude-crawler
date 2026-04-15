package api

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

// TestRateLimitHeadersBasic verifies RFC 6648 headers are present and correctly formatted
func TestRateLimitHeadersBasic(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Create test user and API key
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "test", db.KeyTypeAPI)
	require.NoError(t, err)

	// Create handler that returns 200 OK
	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{"status":"ok"}`))
			}),
		),
	)

	// Make request
	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Verify response status
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify RFC 6648 headers are present
	assert.NotEmpty(t, w.Header().Get("RateLimit-Limit"))
	assert.NotEmpty(t, w.Header().Get("RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("RateLimit-Reset"))

	// Verify header values are valid integers
	limit, err := strconv.Atoi(w.Header().Get("RateLimit-Limit"))
	assert.NoError(t, err)
	assert.Equal(t, 100, limit) // API keys have 100 req/min limit

	remaining, err := strconv.Atoi(w.Header().Get("RateLimit-Remaining"))
	assert.NoError(t, err)
	assert.True(t, remaining > 0)

	resetStr := w.Header().Get("RateLimit-Reset")
	reset, err := strconv.ParseInt(resetStr, 10, 64)
	assert.NoError(t, err)
	assert.True(t, reset > 0) // Should be Unix timestamp
}

// TestRateLimitHeadersAPIKeyLimit verifies API key returns 100 limit
func TestRateLimitHeadersAPIKeyLimit(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("alice")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	limit, _ := strconv.Atoi(w.Header().Get("RateLimit-Limit"))
	assert.Equal(t, 100, limit)
}

// TestRateLimitHeadersWebhookKeyLimit verifies webhook key returns 1000 limit
func TestRateLimitHeadersWebhookKeyLimit(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("bob")
	require.NoError(t, err)

	webhookKeyPlain, err := km.CreateKeyWithType(user.ID, "webhook", db.KeyTypeWebhook)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	req := httptest.NewRequest("GET", "/webhook/delivery", nil)
	req.Header.Set("Authorization", "Bearer "+webhookKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	limit, _ := strconv.Atoi(w.Header().Get("RateLimit-Limit"))
	assert.Equal(t, 1000, limit)
}

// TestRateLimitHeadersRemainingDecreases verifies remaining count decreases per request
func TestRateLimitHeadersRemainingDecreases(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("charlie")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Make first request
	req1 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req1.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)

	remaining1, _ := strconv.Atoi(w1.Header().Get("RateLimit-Remaining"))
	assert.Equal(t, 99, remaining1) // After 1st request: 100 - 1 = 99

	// Make second request within the same minute window
	req2 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req2.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)

	remaining2, _ := strconv.Atoi(w2.Header().Get("RateLimit-Remaining"))
	assert.Equal(t, 98, remaining2) // After 2nd request: 100 - 2 = 98
}

// TestRateLimitHeadersOn429Response verifies headers included even on rate limit exceeded
func TestRateLimitHeadersOn429Response(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("dave")
	require.NoError(t, err)

	// Create key with very low limit for testing
	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "test", db.KeyTypeAPI)
	require.NoError(t, err)

	// Manually set rate limit to 1 req/min for testing
	now := time.Now()
	rateLimit := db.RateLimit{
		UserID:          user.ID,
		KeyID:           nil,
		RequestsThisMin: 0,
		RequestLimit:    1,
		LastResetTime:   now,
	}
	require.NoError(t, database.Create(&rateLimit).Error)

	// Update key to point to this rate limit
	var key db.APIKey
	require.NoError(t, database.Where("user_id = ?", user.ID).First(&key).Error)
	keyID := key.ID
	rateLimit.KeyID = &keyID
	require.NoError(t, database.Model(&rateLimit).Update("key_id", keyID).Error)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// First request should succeed
	req1 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req1.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Second request should fail with 429 but still have headers
	req2 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req2.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusTooManyRequests, w2.Code) // 429
	assert.NotEmpty(t, w2.Header().Get("RateLimit-Limit"))
	assert.Equal(t, "0", w2.Header().Get("RateLimit-Remaining")) // Remaining should be 0
	assert.NotEmpty(t, w2.Header().Get("RateLimit-Reset"))
}

// TestRateLimitHeadersResetTime verifies reset time is valid Unix timestamp
func TestRateLimitHeadersResetTime(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("eve")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "api", db.KeyTypeAPI)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	// Record request time
	beforeTime := time.Now()
	handler.ServeHTTP(w, req)
	afterTime := time.Now()

	resetStr := w.Header().Get("RateLimit-Reset")
	reset, _ := strconv.ParseInt(resetStr, 10, 64)
	resetTime := time.Unix(reset, 0)

	// Reset time should be approximately current time + 1 minute
	minExpectedReset := beforeTime.Add(time.Minute)
	maxExpectedReset := afterTime.Add(time.Minute)

	assert.True(t, resetTime.After(minExpectedReset.Add(-5*time.Second)),
		"Reset time should not be in the past")
	assert.True(t, resetTime.Before(maxExpectedReset.Add(5*time.Second)),
		"Reset time should not be more than 1 minute in the future")
}

// TestRateLimitHeadersIndependentBuckets verifies different keys have independent rate limits
func TestRateLimitHeadersIndependentBuckets(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	// Create two users
	user1, err := um.CreateUser("frank")
	require.NoError(t, err)

	user2, err := um.CreateUser("grace")
	require.NoError(t, err)

	// Create API keys for each
	key1Plain, err := km.CreateKeyWithType(user1.ID, "api1", db.KeyTypeAPI)
	require.NoError(t, err)

	key2Plain, err := km.CreateKeyWithType(user2.ID, "api2", db.KeyTypeAPI)
	require.NoError(t, err)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	// Make request with key1
	req1 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req1.Header.Set("Authorization", "Bearer "+key1Plain)
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req1)
	remaining1, _ := strconv.Atoi(w1.Header().Get("RateLimit-Remaining"))

	// Make request with key2
	req2 := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req2.Header.Set("Authorization", "Bearer "+key2Plain)
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req2)
	remaining2, _ := strconv.Atoi(w2.Header().Get("RateLimit-Remaining"))

	// Both should show 99 remaining (not affected by each other)
	assert.Equal(t, 99, remaining1)
	assert.Equal(t, 99, remaining2)
}

// TestNewRateLimitHeaders tests header construction
func TestNewRateLimitHeaders(t *testing.T) {
	now := time.Now()
	rateLimit := &db.RateLimit{
		RequestsThisMin: 25,
		RequestLimit:    100,
		LastResetTime:   now,
	}

	headers := NewRateLimitHeaders(rateLimit)

	assert.Equal(t, 100, headers.Limit)
	assert.Equal(t, 75, headers.Remaining) // 100 - 25
	assert.Equal(t, now.Add(time.Minute).Unix(), headers.Reset)
}

// TestNewRateLimitHeadersNegativeRemaining tests when remaining would be negative
func TestNewRateLimitHeadersNegativeRemaining(t *testing.T) {
	now := time.Now()
	rateLimit := &db.RateLimit{
		RequestsThisMin: 105, // Over limit
		RequestLimit:    100,
		LastResetTime:   now,
	}

	headers := NewRateLimitHeaders(rateLimit)

	assert.Equal(t, 100, headers.Limit)
	assert.Equal(t, 0, headers.Remaining) // Should clamp to 0, not negative
	assert.Equal(t, now.Add(time.Minute).Unix(), headers.Reset)
}

// TestApplyToResponseHeader tests header application to response
func TestApplyToResponseHeader(t *testing.T) {
	now := time.Now()
	headers := &RateLimitHeaders{
		Limit:     100,
		Remaining: 50,
		Reset:     now.Unix(),
	}

	w := httptest.NewRecorder()
	headers.ApplyToResponseHeader(w)

	assert.Equal(t, "100", w.Header().Get("RateLimit-Limit"))
	assert.Equal(t, "50", w.Header().Get("RateLimit-Remaining"))
	assert.Equal(t, strconv.FormatInt(now.Unix(), 10), w.Header().Get("RateLimit-Reset"))
}

// TestApplyToResponseHeaderForLimit tests error case header application
func TestApplyToResponseHeaderForLimit(t *testing.T) {
	now := time.Now()
	w := httptest.NewRecorder()

	ApplyToResponseHeaderForLimit(w, 100, 0, now.Add(time.Minute))

	assert.Equal(t, "100", w.Header().Get("RateLimit-Limit"))
	assert.Equal(t, "0", w.Header().Get("RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("RateLimit-Reset"))
}

// TestRateLimitHeadersBoundaryRemaining0 tests exact boundary case when remaining is 0
func TestRateLimitHeadersBoundaryRemaining0(t *testing.T) {
	database := testutil.NewTestDB(t)
	logger := zap.NewNop()
	um := auth.NewUserManager(database)
	km := auth.NewKeyManager(database)

	user, err := um.CreateUser("henry")
	require.NoError(t, err)

	apiKeyPlain, err := km.CreateKeyWithType(user.ID, "test", db.KeyTypeAPI)
	require.NoError(t, err)

	// Create rate limit at exactly the limit
	now := time.Now()
	var keyID int64
	var key db.APIKey
	require.NoError(t, database.Where("user_id = ?", user.ID).First(&key).Error)
	keyID = key.ID

	rateLimit := db.RateLimit{
		UserID:          user.ID,
		KeyID:           &keyID,
		RequestsThisMin: 100, // Exactly at limit
		RequestLimit:    100,
		LastResetTime:   now,
	}
	require.NoError(t, database.Create(&rateLimit).Error)

	handler := MultiKeyAuthMiddleware(database, logger)(
		MultiKeyRateLimitMiddleware(database, logger)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	req := httptest.NewRequest("GET", "/api/v1/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+apiKeyPlain)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should be 429 with remaining = 0
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Equal(t, "0", w.Header().Get("RateLimit-Remaining"))
}
