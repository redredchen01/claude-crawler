package db

import (
	"time"
)

// Credit represents a user's credit balance
type Credit struct {
	ID        int64      `gorm:"primaryKey"`
	UserID    int64      `gorm:"index;not null;uniqueIndex"`
	Balance   int64      `gorm:"not null;default:0"` // Balance in credits (1 credit = 1 GB by default)
	CreatedAt time.Time  `gorm:"index"`
	UpdatedAt time.Time
	Version   int64      `gorm:"default:0"` // Optimistic locking to prevent race conditions

	// Relations
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for Credit
func (Credit) TableName() string {
	return "credits"
}

// CreditTransactionType represents the type of credit transaction
type CreditTransactionType string

const (
	TransactionTypeUsage      CreditTransactionType = "usage"      // Download consumed credits
	TransactionTypeRefund     CreditTransactionType = "refund"     // Download failed, credits refunded
	TransactionTypeAdminAdjust CreditTransactionType = "admin_adjust" // Admin manual adjustment
	TransactionTypePurchase   CreditTransactionType = "purchase"   // User purchased credits
)

// CreditTransaction represents an immutable record of credit changes
// This table is INSERT-only: no UPDATEs allowed after creation
type CreditTransaction struct {
	ID        int64     `gorm:"primaryKey"`
	UserID    int64     `gorm:"index;not null"`
	TaskID    string    `gorm:"type:varchar(36);nullable;index"` // Associated download task (for usage/refund)
	Type      string    `gorm:"type:varchar(50);not null;index"`  // usage, refund, admin_adjust, purchase
	Amount    int64     `gorm:"not null"`                         // Positive (deduct) or negative (refund)
	Reason    string    `gorm:"type:text;nullable"`              // Optional reason (e.g., "User download 2GB video")
	AdminID   int64     `gorm:"nullable;index"`                  // Admin who made the change (for admin_adjust)
	CreatedAt time.Time `gorm:"index;autoCreateTime"` // Immutable timestamp

	// Relations
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
	// Note: Do NOT add ON UPDATE CASCADE or ON DELETE CASCADE to TaskID (it's optional foreign key reference)
}

// TableName specifies table name for CreditTransaction
func (CreditTransaction) TableName() string {
	return "credit_transactions"
}

// BillingConfig represents system-wide billing configuration
type BillingConfig struct {
	ID              int64     `gorm:"primaryKey"`
	CreditsPerGB    float64   `gorm:"default:1.0"` // 1 credit = 1 GB by default
	InitialCredits  int64     `gorm:"default:0"`   // Initial credits for new users
	CreatedAt       time.Time `gorm:"autoCreateTime"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
}

// TableName specifies table name for BillingConfig
func (BillingConfig) TableName() string {
	return "billing_configs"
}
