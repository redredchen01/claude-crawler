package db

import (
	"time"
)

// KeyType represents the type of API key
type KeyType string

const (
	KeyTypeAPI    KeyType = "api"
	KeyTypeWebhook KeyType = "webhook"
)

// APIKey represents an API key for user authentication
type APIKey struct {
	ID        int64     `gorm:"primaryKey"`
	UserID    int64     `gorm:"index;not null"`
	Name      string    `gorm:"type:varchar(255);nullable"` // Optional friendly name
	KeyHash   string    `gorm:"type:varchar(255);uniqueIndex;not null"` // bcrypt hash
	KeyType   string    `gorm:"type:varchar(50);default:'api';index"` // api or webhook
	CreatedAt time.Time `gorm:"index"`
	UpdatedAt time.Time
	LastUsedAt *time.Time `gorm:"nullable;index"`
	ExpiresAt *time.Time `gorm:"nullable;index"` // Optional expiration
	IsRevoked bool       `gorm:"default:false;index"`

	// Relations
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for APIKey
func (APIKey) TableName() string {
	return "api_keys"
}

// IsValid checks if key is not revoked and not expired
func (ak *APIKey) IsValid() bool {
	if ak.IsRevoked {
		return false
	}
	if ak.ExpiresAt != nil && time.Now().After(*ak.ExpiresAt) {
		return false
	}
	return true
}

// IsValidType checks if key type is valid
func (ak *APIKey) IsValidType() bool {
	return ak.KeyType == string(KeyTypeAPI) || ak.KeyType == string(KeyTypeWebhook)
}

// UpdateLastUsed updates the last_used_at timestamp
func (ak *APIKey) UpdateLastUsed() {
	now := time.Now()
	ak.LastUsedAt = &now
}
