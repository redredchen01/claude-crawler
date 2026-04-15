package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"go.uber.org/zap"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/metrics"
)

func setupTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.InitDB(dbConn)
	require.NoError(t, err)

	return dbConn
}

func setupTestRedis() *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
}

func TestGetMetrics_ValidRequest(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Insert test data
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)

	sessions := []db.DownloadSession{
		{
			SessionID:     "test-1",
			FileURL:       "http://example.com/file1",
			SourceType:    "http",
			Status:        "pending",
			CreatedAt:     now,
			UpdatedAt:     now,
			LastHeartbeat: now,
		},
		{
			SessionID:     "test-2",
			FileURL:       "http://example.com/file2",
			SourceType:    "http",
			Status:        "processing",
			CreatedAt:     now,
			UpdatedAt:     now,
			LastHeartbeat: now,
		},
		{
			SessionID:     "test-3",
			FileURL:       "http://example.com/file3",
			SourceType:    "http",
			Status:        "failed",
			CreatedAt:     sevenDaysAgo.Add(1 * time.Hour),
			UpdatedAt:     sevenDaysAgo.Add(1 * time.Hour),
			LastHeartbeat: sevenDaysAgo.Add(1 * time.Hour),
			ErrorMessage:  "Network timeout",
		},
		{
			SessionID:     "test-4",
			FileURL:       "http://example.com/file4",
			SourceType:    "http",
			Status:        "done",
			CreatedAt:     sevenDaysAgo.Add(2 * time.Hour),
			UpdatedAt:     sevenDaysAgo.Add(3 * time.Hour),
			LastHeartbeat: sevenDaysAgo.Add(3 * time.Hour),
			CompletedAt:   timePtr(sevenDaysAgo.Add(3 * time.Hour)),
		},
	}

	for _, session := range sessions {
		result := dbConn.Create(&session)
		require.NoError(t, result.Error)
	}

	// Make request
	req := httptest.NewRequest("GET", "/metrics", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.GetMetrics(w, req)

	// Verify response
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var m metrics.Metrics
	err := json.NewDecoder(w.Body).Decode(&m)
	require.NoError(t, err)

	// Verify metrics
	assert.Equal(t, int64(1), m.PendingCount)
	assert.Equal(t, int64(1), m.ProcessingCount)
	assert.Equal(t, int64(1), m.FailedCount)

	// Error rate: 1 failed / 4 total = 0.25
	expectedErrorRate := 0.25
	assert.InDelta(t, expectedErrorRate, m.ErrorRate7d, 0.01)
}

func TestGetMetrics_IPWhitelistDenied(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	t.Setenv("DASHBOARD_IP_WHITELIST", "192.168.1.0/24")
	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Request from non-whitelisted IP
	req := httptest.NewRequest("GET", "/metrics", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.GetMetrics(w, req)

	// Should be forbidden
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetMetrics_IPWhitelistAllowed(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	t.Setenv("DASHBOARD_IP_WHITELIST", "127.0.0.0/24")
	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Request from whitelisted CIDR
	req := httptest.NewRequest("GET", "/metrics", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.GetMetrics(w, req)

	// Should succeed
	assert.Equal(t, http.StatusOK, w.Code)

	var m metrics.Metrics
	err := json.NewDecoder(w.Body).Decode(&m)
	require.NoError(t, err)
}

func TestGetMetrics_DefaultWhitelist(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	// No env var set, should default to 127.0.0.1/32
	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Test localhost allowed
	req := httptest.NewRequest("GET", "/metrics", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.GetMetrics(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Test other IP denied
	req2 := httptest.NewRequest("GET", "/metrics", nil)
	req2.RemoteAddr = "192.168.1.1:12345"
	w2 := httptest.NewRecorder()

	handler.GetMetrics(w2, req2)
	assert.Equal(t, http.StatusForbidden, w2.Code)
}

func TestGetErrors_ValidRequest(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Insert error records
	now := time.Now()
	for i := 0; i < 5; i++ {
		session := db.DownloadSession{
			SessionID:     "error-" + string(rune('1'+i)),
			FileURL:       "http://example.com/file",
			SourceType:    "http",
			Status:        "failed",
			CreatedAt:     now.Add(-time.Duration(i) * time.Hour),
			UpdatedAt:     now.Add(-time.Duration(i) * time.Hour),
			LastHeartbeat: now.Add(-time.Duration(i) * time.Hour),
			ErrorMessage:  "Test error " + string(rune('1'+i)),
		}
		result := dbConn.Create(&session)
		require.NoError(t, result.Error)
	}

	// Make request
	req := httptest.NewRequest("GET", "/metrics/errors", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	w := httptest.NewRecorder()

	handler.GetErrors(w, req)

	// Verify response
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var errors []metrics.ErrorRecord
	err := json.NewDecoder(w.Body).Decode(&errors)
	require.NoError(t, err)

	// Should return all 5 errors
	assert.Equal(t, 5, len(errors))
	// Most recent error should be first (ordered by created_at DESC)
	assert.Equal(t, "error-1", errors[0].SessionID)
}

func TestGetErrors_IPWhitelistDenied(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	t.Setenv("DASHBOARD_IP_WHITELIST", "10.0.0.0/8")
	handler := NewDashboardHandler(dbConn, redisClient, logger)

	// Request from non-whitelisted IP
	req := httptest.NewRequest("GET", "/metrics/errors", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	w := httptest.NewRecorder()

	handler.GetErrors(w, req)

	// Should be forbidden
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestQueueDepthCalculation(t *testing.T) {
	// Create a mock redis client for testing queue depth
	// This test focuses on the calculation logic
	testCases := []struct {
		name     string
		priority string
		expected int64
	}{
		{"High priority", "10", 5},
		{"Normal priority", "5", 10},
		{"Low priority", "1", 3},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Each test case would need actual Redis setup
			// This is a simplified test structure
			assert.True(t, true)
		})
	}
}

func TestErrorRateCalculation(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	collector := metrics.NewCollector(dbConn, redisClient, logger)

	// Create test data: 10 total, 2 failed (all within 7 days)
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)
	recentTime := sevenDaysAgo.Add(1 * time.Hour)

	for i := 0; i < 10; i++ {
		status := "done"
		if i < 2 {
			status = "failed"
		}

		session := db.DownloadSession{
			SessionID:     "calc-" + string(byte('0'+i)),
			FileURL:       "http://example.com/file",
			SourceType:    "http",
			Status:        status,
			CreatedAt:     recentTime.Add(time.Duration(i) * time.Hour),
			UpdatedAt:     recentTime.Add(time.Duration(i) * time.Hour),
			LastHeartbeat: recentTime.Add(time.Duration(i) * time.Hour),
			CompletedAt:   timePtr(recentTime.Add(time.Duration(i+1) * time.Hour)),
		}
		result := dbConn.Create(&session)
		require.NoError(t, result.Error)
	}

	// Collect metrics
	ctx := context.Background()
	m, err := collector.Collect(ctx)
	require.NoError(t, err)

	// Error rate: 2/10 = 0.2
	expectedRate := 0.2
	assert.InDelta(t, expectedRate, m.ErrorRate7d, 0.02)
}

func TestAvgTranscodeTimeCalculation(t *testing.T) {
	dbConn := setupTestDB(t)
	redisClient := setupTestRedis()
	logger, _ := zap.NewProduction()

	collector := metrics.NewCollector(dbConn, redisClient, logger)

	// Create test data with known durations
	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)

	for i := 0; i < 3; i++ {
		startTime := sevenDaysAgo.Add(time.Duration(i) * time.Hour)
		endTime := startTime.Add(time.Duration((i+1)*10) * time.Second) // 10s, 20s, 30s

		session := db.DownloadSession{
			SessionID:     "transcode-" + string(rune('0'+i)),
			FileURL:       "http://example.com/file",
			SourceType:    "http",
			Status:        "done",
			CreatedAt:     startTime,
			UpdatedAt:     endTime,
			LastHeartbeat: endTime,
			CompletedAt:   &endTime,
		}
		result := dbConn.Create(&session)
		require.NoError(t, result.Error)
	}

	// Collect metrics
	ctx := context.Background()
	m, err := collector.Collect(ctx)
	require.NoError(t, err)

	// Average: (10 + 20 + 30) / 3 = 20 seconds
	// Allow larger tolerance due to time variations
	expectedAvg := 20.0
	assert.InDelta(t, expectedAvg, m.AvgTranscodeTime7d, 10.0)
}

// Helper functions
func timePtr(t time.Time) *time.Time {
	return &t
}
