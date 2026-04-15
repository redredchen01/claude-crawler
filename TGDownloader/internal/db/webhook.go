package db

import (
	"time"
)

// Webhook represents a user's webhook endpoint for download notifications
type Webhook struct {
	ID        int64      `gorm:"primaryKey"`
	UserID    int64      `gorm:"index;not null"`
	URL       string     `gorm:"type:text;not null"`
	Secret    string     `gorm:"type:varchar(255);not null"` // HMAC secret for signature verification
	Active    bool       `gorm:"default:true;index"`
	CreatedAt time.Time  `gorm:"index"`
	UpdatedAt time.Time
	DeletedAt *time.Time `gorm:"nullable;index"` // Soft delete for audit trail

	// Relations
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for Webhook
func (Webhook) TableName() string {
	return "webhooks"
}


// WebhookDelivery tracks a single webhook delivery attempt for a task
type WebhookDelivery struct {
	ID             int64                   `gorm:"primaryKey"`
	WebhookID      int64                   `gorm:"index;not null"`
	TaskID         string                  `gorm:"type:varchar(36);index;not null"`
	UserID         int64                   `gorm:"index;not null"`
	Status         string                  `gorm:"type:varchar(50);index"` // pending, delivered, failed
	AttemptCount   int                     `gorm:"default:0"`
	LastError      string                  `gorm:"type:text;nullable"`
	NextRetryAt    *time.Time              `gorm:"nullable;index"`
	LastAttemptAt  *time.Time              `gorm:"nullable"`
	DeliveredAt    *time.Time              `gorm:"nullable;index"`
	CreatedAt      time.Time               `gorm:"index"`
	UpdatedAt      time.Time

	// Relations
	Webhook Webhook `gorm:"foreignKey:WebhookID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for WebhookDelivery
func (WebhookDelivery) TableName() string {
	return "webhook_deliveries"
}

// IsValid checks if webhook is active and not deleted
func (w *Webhook) IsValid() bool {
	return w.Active && w.DeletedAt == nil
}

// CanRetry checks if delivery can be retried (max 3 attempts)
func (wd *WebhookDelivery) CanRetry() bool {
	return wd.AttemptCount < 3
}
