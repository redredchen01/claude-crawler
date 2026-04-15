package quota

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

func setupQuotaTest(t *testing.T) (*gorm.DB, *Manager, int64) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create test user
	user := &db.User{
		Username: "testuser",
		IsActive: true,
	}
	require.NoError(t, dbConn.Create(user).Error)

	manager := NewManager(dbConn, logger)
	return dbConn, manager, user.ID
}

func TestGetQuota_DefaultQuotaCreated(t *testing.T) {
	_, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// Get quota for new user
	usage, limit, err := qm.GetQuota(ctx, userID)

	assert.NoError(t, err)
	assert.Equal(t, int64(0), usage, "new quota should have 0 usage")
	assert.Equal(t, DefaultQuotaLimitBytes, limit, "limit should be default 1 TB")
}

func TestGetQuota_ReturnsExistingQuota(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// First call creates quota
	_, _, err := qm.GetQuota(ctx, userID)
	require.NoError(t, err)

	// Manually update quota in DB
	testLimit := int64(500 * 1024 * 1024) // 500 MB
	testUsage := int64(250 * 1024 * 1024)  // 250 MB
	require.NoError(t, dbConn.Model(&db.Quota{}).
		Where("user_id = ?", userID).
		Updates(map[string]interface{}{
			"quota_limit_bytes":       testLimit,
			"downloaded_bytes_month": testUsage,
		}).Error)

	// Get quota again
	usage, limit, err := qm.GetQuota(ctx, userID)

	assert.NoError(t, err)
	assert.Equal(t, testUsage, usage)
	assert.Equal(t, testLimit, limit)
}

func TestCheckQuota_WithinLimit(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// User at 50% quota
	usageBytes := int64(500 * 1024 * 1024) // 500 MB (50% of 1 TB)
	qm.GetQuota(ctx, userID)              // Initialize
	require.NoError(t, dbConn.Model(&db.Quota{}).
		Where("user_id = ?", userID).
		Update("downloaded_bytes_month", usageBytes).Error)

	// Download 100 MB should succeed
	canDownload := qm.CheckQuota(ctx, userID, 100*1024*1024)
	assert.True(t, canDownload, "should allow download when within quota")
}

func TestCheckQuota_AtLimit(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// User at 99% quota
	limit := DefaultQuotaLimitBytes
	usageBytes := limit - 100*1024*1024 // 99% of 1 TB

	qm.GetQuota(ctx, userID)
	require.NoError(t, dbConn.Model(&db.Quota{}).
		Where("user_id = ?", userID).
		Update("downloaded_bytes_month", usageBytes).Error)

	// Download 50 MB should succeed (fits in remaining 100 MB)
	canDownload := qm.CheckQuota(ctx, userID, 50*1024*1024)
	assert.True(t, canDownload, "should allow download at 99% quota")

	// Download 150 MB should fail (exceeds remaining 100 MB)
	canDownload = qm.CheckQuota(ctx, userID, 150*1024*1024)
	assert.False(t, canDownload, "should reject download that exceeds quota")
}

func TestCheckQuota_ExceededLimit(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// User at 100%+ quota
	limit := DefaultQuotaLimitBytes
	usageBytes := limit + 100*1024*1024 // Over quota

	qm.GetQuota(ctx, userID)
	require.NoError(t, dbConn.Model(&db.Quota{}).
		Where("user_id = ?", userID).
		Update("downloaded_bytes_month", usageBytes).Error)

	// Any download should fail
	canDownload := qm.CheckQuota(ctx, userID, 1)
	assert.False(t, canDownload, "should reject download when quota exceeded")
}

func TestIncrementQuota_UpdatesUsage(t *testing.T) {
	_, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// Initialize quota
	qm.GetQuota(ctx, userID)

	// Increment by 100 MB
	downloadBytes := int64(100 * 1024 * 1024)
	err := qm.IncrementQuota(ctx, userID, downloadBytes)
	require.NoError(t, err)

	// Verify usage updated
	usage, _, err := qm.GetQuota(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, downloadBytes, usage, "usage should be incremented")
}

func TestIncrementQuota_Multiple(t *testing.T) {
	_, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	qm.GetQuota(ctx, userID)

	// Multiple increments
	sizes := []int64{100 * 1024 * 1024, 50 * 1024 * 1024, 25 * 1024 * 1024}
	for _, size := range sizes {
		require.NoError(t, qm.IncrementQuota(ctx, userID, size))
	}

	// Total should be sum of all increments
	usage, _, err := qm.GetQuota(ctx, userID)
	require.NoError(t, err)

	expectedTotal := int64(175 * 1024 * 1024)
	assert.Equal(t, expectedTotal, usage, "usage should be sum of all increments")
}

func TestIncrementQuota_CreatesQuotaIfMissing(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// Increment without calling GetQuota first
	downloadBytes := int64(50 * 1024 * 1024)
	err := qm.IncrementQuota(ctx, userID, downloadBytes)
	require.NoError(t, err)

	// Quota should be created
	usage, _, err := qm.GetQuota(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, downloadBytes, usage, "quota should be auto-created on increment")

	// Verify in DB
	var quota db.Quota
	require.NoError(t, dbConn.Where("user_id = ?", userID).First(&quota).Error)
	assert.Equal(t, downloadBytes, quota.DownloadedBytesMonth)
}

func TestResetMonthlyQuotas_ResetsOldQuotas(t *testing.T) {
	dbConn, qm, userID := setupQuotaTest(t)
	ctx := context.Background()

	// Create quota for last month with usage
	lastMonth := time.Now().UTC().AddDate(0, -1, 0)
	firstOfLastMonth := time.Date(lastMonth.Year(), lastMonth.Month(), 1, 0, 0, 0, 0, time.UTC)

	quota := &db.Quota{
		UserID:               userID,
		DownloadedBytesMonth: 500 * 1024 * 1024,
		QuotaLimitBytes:      DefaultQuotaLimitBytes,
		QuotaResetDate:       firstOfLastMonth,
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	require.NoError(t, dbConn.Create(quota).Error)

	// Reset quotas
	err := qm.ResetMonthlyQuotas(ctx)
	require.NoError(t, err)

	// Verify quota was reset
	var resetQuota db.Quota
	require.NoError(t, dbConn.Where("user_id = ?", userID).First(&resetQuota).Error)

	assert.Equal(t, int64(0), resetQuota.DownloadedBytesMonth, "usage should be reset to 0")
	assert.Equal(t, time.Now().UTC().Year(), resetQuota.QuotaResetDate.Year())
	assert.Equal(t, time.Now().UTC().Month(), resetQuota.QuotaResetDate.Month())
	assert.Equal(t, 1, resetQuota.QuotaResetDate.Day(), "reset_date should be 1st of current month")
}

func TestResetMonthlyQuotas_MultipleUsers(t *testing.T) {
	dbConn, qm, _ := setupQuotaTest(t)
	ctx := context.Background()

	// Create second user
	user2 := &db.User{Username: "testuser2", IsActive: true}
	require.NoError(t, dbConn.Create(user2).Error)

	// Create quotas for both users from last month
	lastMonth := time.Now().UTC().AddDate(0, -1, 0)
	firstOfLastMonth := time.Date(lastMonth.Year(), lastMonth.Month(), 1, 0, 0, 0, 0, time.UTC)

	quota1 := &db.Quota{
		UserID:               1,
		DownloadedBytesMonth: 300 * 1024 * 1024,
		QuotaLimitBytes:      DefaultQuotaLimitBytes,
		QuotaResetDate:       firstOfLastMonth,
	}
	quota2 := &db.Quota{
		UserID:               user2.ID,
		DownloadedBytesMonth: 700 * 1024 * 1024,
		QuotaLimitBytes:      DefaultQuotaLimitBytes,
		QuotaResetDate:       firstOfLastMonth,
	}

	require.NoError(t, dbConn.Create([]*db.Quota{quota1, quota2}).Error)

	// Reset
	err := qm.ResetMonthlyQuotas(ctx)
	require.NoError(t, err)

	// Both should be reset
	var q1, q2 db.Quota
	require.NoError(t, dbConn.Where("user_id = ?", 1).First(&q1).Error)
	require.NoError(t, dbConn.Where("user_id = ?", user2.ID).First(&q2).Error)

	assert.Equal(t, int64(0), q1.DownloadedBytesMonth)
	assert.Equal(t, int64(0), q2.DownloadedBytesMonth)
}

func TestQuotaModel_IsExceeded(t *testing.T) {
	quota := &db.Quota{
		DownloadedBytesMonth: DefaultQuotaLimitBytes + 1,
		QuotaLimitBytes:      DefaultQuotaLimitBytes,
	}

	assert.True(t, quota.IsExceeded(), "should be exceeded when usage > limit")

	quota.DownloadedBytesMonth = DefaultQuotaLimitBytes
	assert.True(t, quota.IsExceeded(), "should be exceeded when usage == limit")

	quota.DownloadedBytesMonth = DefaultQuotaLimitBytes - 1
	assert.False(t, quota.IsExceeded(), "should not be exceeded when usage < limit")
}

func TestQuotaModel_RemainingBytes(t *testing.T) {
	quota := &db.Quota{
		DownloadedBytesMonth: 250 * 1024 * 1024,
		QuotaLimitBytes:      1000 * 1024 * 1024,
	}

	remaining := quota.RemainingBytes()
	expected := int64(750 * 1024 * 1024)
	assert.Equal(t, expected, remaining, "remaining should be limit - usage")

	// Test exceeded quota
	quota.DownloadedBytesMonth = 1100 * 1024 * 1024
	remaining = quota.RemainingBytes()
	assert.Equal(t, int64(0), remaining, "remaining should be 0 when exceeded")
}
