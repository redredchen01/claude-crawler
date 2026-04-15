package quota

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

const (
	// DefaultQuotaLimitBytes is 1 TB
	DefaultQuotaLimitBytes int64 = 1099511627776
)

var (
	ErrQuotaExceeded = errors.New("storage quota exceeded")
	ErrUserNotFound  = errors.New("user not found")
)

// Manager manages per-user storage quotas
type Manager struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewManager creates a new quota manager
func NewManager(dbConn *gorm.DB, logger *zap.Logger) *Manager {
	return &Manager{
		db:     dbConn,
		logger: logger,
	}
}

// GetQuota retrieves user quota info (usage, limit)
// Returns current usage bytes, limit bytes, and error
func (m *Manager) GetQuota(ctx context.Context, userID int64) (usageBytes, limitBytes int64, err error) {
	var quota db.Quota
	if err := m.db.WithContext(ctx).
		Where("user_id = ? AND quota_reset_date = ?", userID, currentMonthStart()).
		First(&quota).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// Create default quota for user
			quota := &db.Quota{
				UserID:               userID,
				DownloadedBytesMonth: 0,
				QuotaLimitBytes:      DefaultQuotaLimitBytes,
				QuotaResetDate:       currentMonthStart(),
				CreatedAt:            time.Now(),
				UpdatedAt:            time.Now(),
			}
			if err := m.db.WithContext(ctx).Create(quota).Error; err != nil {
				m.logger.Error("failed to create quota", zap.Int64("user_id", userID), zap.Error(err))
				return 0, DefaultQuotaLimitBytes, err
			}
			return 0, DefaultQuotaLimitBytes, nil
		}
		m.logger.Error("failed to fetch quota", zap.Int64("user_id", userID), zap.Error(err))
		return 0, DefaultQuotaLimitBytes, err
	}

	return quota.DownloadedBytesMonth, quota.QuotaLimitBytes, nil
}

// CheckQuota checks if user can download newBytes without exceeding quota
// Returns true if within quota after adding newBytes, false otherwise
func (m *Manager) CheckQuota(ctx context.Context, userID int64, newBytes int64) bool {
	usageBytes, limitBytes, err := m.GetQuota(ctx, userID)
	if err != nil {
		m.logger.Warn("quota check failed, assuming allowed",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return true // Graceful degradation: allow if quota check fails
	}

	return usageBytes+newBytes <= limitBytes
}

// IncrementQuota increments user's quota usage after successful download
func (m *Manager) IncrementQuota(ctx context.Context, userID int64, bytes int64) error {
	resetDate := currentMonthStart()

	result := m.db.WithContext(ctx).
		Model(&db.Quota{}).
		Where("user_id = ? AND quota_reset_date = ?", userID, resetDate).
		Update("downloaded_bytes_month", gorm.Expr("downloaded_bytes_month + ?", bytes))

	if result.Error != nil {
		m.logger.Error("failed to increment quota",
			zap.Int64("user_id", userID),
			zap.Int64("bytes", bytes),
			zap.Error(result.Error),
		)
		return result.Error
	}

	// If no rows affected, quota record might not exist for this month; create it
	if result.RowsAffected == 0 {
		quota := &db.Quota{
			UserID:               userID,
			DownloadedBytesMonth: bytes,
			QuotaLimitBytes:      DefaultQuotaLimitBytes,
			QuotaResetDate:       resetDate,
			CreatedAt:            time.Now(),
			UpdatedAt:            time.Now(),
		}
		if err := m.db.WithContext(ctx).Create(quota).Error; err != nil {
			m.logger.Error("failed to create quota during increment",
				zap.Int64("user_id", userID),
				zap.Int64("bytes", bytes),
				zap.Error(err),
			)
			return err
		}
	}

	return nil
}

// ResetMonthlyQuotas resets quota counters for all users on month boundary
// Should be called daily; idempotent (only resets if reset_date != current month start)
func (m *Manager) ResetMonthlyQuotas(ctx context.Context) error {
	now := time.Now().UTC()
	currentMonth := currentMonthStart()
	lastMonth := currentMonth.AddDate(0, -1, 0)

	// Find all quotas from last month that haven't been reset
	var oldQuotas []db.Quota
	if err := m.db.WithContext(ctx).
		Where("quota_reset_date = ?", lastMonth).
		Find(&oldQuotas).Error; err != nil {
		m.logger.Error("failed to find old quotas", zap.Error(err))
		return err
	}

	// Batch update reset_date and zero out the counter for each user
	for _, oldQuota := range oldQuotas {
		if err := m.db.WithContext(ctx).
			Model(&db.Quota{}).
			Where("id = ?", oldQuota.ID).
			Updates(map[string]interface{}{
				"downloaded_bytes_month": 0,
				"quota_reset_date":       currentMonth,
				"updated_at":             now,
			}).Error; err != nil {
			m.logger.Error("failed to reset quota",
				zap.Int64("user_id", oldQuota.UserID),
				zap.Error(err),
			)
			continue
		}
	}

	m.logger.Info("monthly quotas reset", zap.Int("count", len(oldQuotas)))
	return nil
}

// currentMonthStart returns the start of current month in UTC
func currentMonthStart() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}
