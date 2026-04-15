package db

import (
	"time"
)

// User represents a system user with API access
type User struct {
	ID        int64     `gorm:"primaryKey"`
	Username  string    `gorm:"type:varchar(32);uniqueIndex;not null"`
	CreatedAt time.Time `gorm:"index"`
	UpdatedAt time.Time
	DeletedAt *time.Time `gorm:"nullable;index"` // Soft delete for audit trail
	IsActive  bool       `gorm:"default:true;index"`

	// Relations
	APIKeys []APIKey `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for User
func (User) TableName() string {
	return "users"
}

// IsValid checks if user is active and not deleted
func (u *User) IsValid() bool {
	return u.IsActive && u.DeletedAt == nil
}
