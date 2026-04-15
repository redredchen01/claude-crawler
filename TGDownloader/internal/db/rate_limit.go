package db

import "time"

// RateLimit tracks per-key rate limit state (each key has independent bucket)
type RateLimit struct {
	ID                int64     `gorm:"primaryKey"`
	UserID            int64     `gorm:"index;not null"`
	KeyID             *int64    `gorm:"index;nullable"` // FK to APIKey; nullable for legacy per-user limits
	RequestsThisMin   int       `gorm:"default:0"`
	RequestLimit      int       `gorm:"default:100"`
	LastResetTime     time.Time `gorm:"index"`
	CreatedAt         time.Time
	UpdatedAt         time.Time

	// Relations
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	APIKey *APIKey `gorm:"foreignKey:KeyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for RateLimit
func (RateLimit) TableName() string {
	return "rate_limits"
}
