package api

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

func setupRateLimiterTest(t *testing.T) (*gorm.DB, *RateLimiter, int64) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create test user
	user := &db.User{
		Username: "testuser",
		IsActive: true,
	}
	require.NoError(t, dbConn.Create(user).Error)

	limiter := NewRateLimiter(dbConn, logger, 100.0/60.0, 20) // 100 req/min, 20 burst

	return dbConn, limiter, user.ID
}

func TestRateLimiter_AllowBasic(t *testing.T) {
	_, limiter, userID := setupRateLimiterTest(t)

	// First request should always be allowed (has max burst tokens)
	assert.True(t, limiter.Allow(userID), "first request should be allowed")
}

func TestRateLimiter_BurstCapacity(t *testing.T) {
	_, limiter, userID := setupRateLimiterTest(t)

	// Consume the burst capacity (20 tokens)
	for i := 0; i < 20; i++ {
		assert.True(t, limiter.Allow(userID), "request %d should be allowed within burst", i+1)
	}

	// 21st request should be denied (no burst tokens, and time hasn't elapsed for refill)
	assert.False(t, limiter.Allow(userID), "21st request should be denied (burst exhausted)")
}

func TestRateLimiter_MultipleUsers(t *testing.T) {
	dbConn, limiter, userID1 := setupRateLimiterTest(t)
	logger, _ := zap.NewDevelopment()

	// Create second user
	user2 := &db.User{
		Username: "testuser2",
		IsActive: true,
	}
	require.NoError(t, dbConn.Create(user2).Error)
	userID2 := user2.ID

	// User 1 consumes burst
	for i := 0; i < 20; i++ {
		assert.True(t, limiter.Allow(userID1))
	}

	// User 1 should be rate limited
	assert.False(t, limiter.Allow(userID1))

	// User 2 should still have full burst available (isolated buckets)
	assert.True(t, limiter.Allow(userID2), "user 2 should have isolated rate limit bucket")

	logger.Info("multiple users test passed")
}

func TestRateLimiter_TokenRefill(t *testing.T) {
	_, limiter, userID := setupRateLimiterTest(t)

	// Consume burst
	for i := 0; i < 20; i++ {
		limiter.Allow(userID)
	}

	// Should be rate limited
	assert.False(t, limiter.Allow(userID))

	// Sleep for 1+ seconds to allow token refill
	// With 100/60 qps (~1.67 per second), 1 second should refill ~1.67 tokens
	time.Sleep(1100 * time.Millisecond)

	// Should now be allowed (at least 1 token refilled)
	assert.True(t, limiter.Allow(userID), "token should be refilled after time elapsed")
}

func TestRateLimiter_HighRequestRate(t *testing.T) {
	_, limiter, userID := setupRateLimiterTest(t)

	// Rapid fire requests up to burst
	allowedCount := 0
	for i := 0; i < 25; i++ {
		if limiter.Allow(userID) {
			allowedCount++
		}
	}

	// Should allow exactly maxBurst (20) requests
	assert.Equal(t, 20, allowedCount, "should allow exactly maxBurst requests")
}

func TestRateLimiter_ConfigurableMaxQPS(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	user := &db.User{Username: "testuser", IsActive: true}
	require.NoError(t, dbConn.Create(user).Error)

	// Create limiter with very strict rate: 1 req/sec, 1 burst
	strictLimiter := NewRateLimiter(dbConn, logger, 1.0, 1)

	// Only 1 burst token
	assert.True(t, strictLimiter.Allow(user.ID))

	// Second request denied
	assert.False(t, strictLimiter.Allow(user.ID))

	// Wait for refill
	time.Sleep(1100 * time.Millisecond)

	// Should be allowed again
	assert.True(t, strictLimiter.Allow(user.ID), "token should refill after 1+ second")
}
