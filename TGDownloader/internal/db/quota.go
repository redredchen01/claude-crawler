package db

import "time"

// Quota tracks per-user monthly storage quota
type Quota struct {
	ID                    int64     `gorm:"primaryKey"`
	UserID                int64     `gorm:"index;not null"`
	DownloadedBytesMonth  int64     `gorm:"default:0"`
	QuotaLimitBytes       int64     `gorm:"default:1099511627776"` // 1 TB in bytes
	QuotaResetDate        time.Time `gorm:"index"`                   // 1st of month UTC
	CreatedAt             time.Time
	UpdatedAt             time.Time

	// Relation
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for Quota
func (Quota) TableName() string {
	return "quotas"
}

// IsExceeded checks if quota limit has been exceeded
func (q *Quota) IsExceeded() bool {
	return q.DownloadedBytesMonth >= q.QuotaLimitBytes
}

// RemainingBytes returns the number of bytes remaining in the quota
func (q *Quota) RemainingBytes() int64 {
	remaining := q.QuotaLimitBytes - q.DownloadedBytesMonth
	if remaining < 0 {
		return 0
	}
	return remaining
}
