package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

var (
	ErrInsufficientCredits = errors.New("insufficient credits for this operation")
	ErrUserNotFound        = errors.New("user not found")
	ErrCreditNotFound      = errors.New("credit record not found")
)

const (
	// DefaultCreditsPerGB is the default conversion rate: 1 credit = 1 GB
	DefaultCreditsPerGB = 1.0
)

// Manager manages user credits and billing
type Manager struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewManager creates a new billing manager
func NewManager(dbConn *gorm.DB, logger *zap.Logger) *Manager {
	return &Manager{
		db:     dbConn,
		logger: logger,
	}
}

// GetBalance retrieves current credit balance for a user
func (m *Manager) GetBalance(ctx context.Context, userID int64) (int64, error) {
	var credit db.Credit
	if err := m.db.WithContext(ctx).
		Where("user_id = ?", userID).
		First(&credit).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// User has no credit record yet
			return 0, nil
		}
		m.logger.Error("failed to get credit balance",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return 0, err
	}

	return credit.Balance, nil
}

// CheckCredits verifies if user has sufficient credits for a download
// downloadSizeGB must be converted from bytes outside this function
// Returns (canProceed, requiredCredits, error)
func (m *Manager) CheckCredits(ctx context.Context, userID int64, downloadSizeGB int64) (bool, int64, error) {
	balance, err := m.GetBalance(ctx, userID)
	if err != nil {
		m.logger.Warn("credit check failed, assuming allowed",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return true, downloadSizeGB, nil // Graceful degradation
	}

	// For now, 1 credit = 1 GB (configurable via admin later)
	requiredCredits := downloadSizeGB
	return balance >= requiredCredits, requiredCredits, nil
}

// DeductCredits deducts credits after successful download
// Uses SELECT FOR UPDATE to ensure atomic operation and prevent race conditions
// Returns error if insufficient credits (should not happen if CheckCredits was called first)
func (m *Manager) DeductCredits(ctx context.Context, userID int64, taskID string, downloadSizeGB int64) error {
	requiredCredits := downloadSizeGB

	// Use transaction with row lock to prevent race conditions
	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the credit row for this user (SELECT FOR UPDATE)
		var credit db.Credit
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).
			First(&credit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				m.logger.Error("credit record not found for user",
					zap.Int64("user_id", userID),
				)
				return ErrCreditNotFound
			}
			return err
		}

		// Check balance is still sufficient (double-check after lock)
		if credit.Balance < requiredCredits {
			return ErrInsufficientCredits
		}

		// Deduct credits
		newBalance := credit.Balance - requiredCredits
		if err := tx.Model(&db.Credit{}).
			Where("user_id = ? AND version = ?", userID, credit.Version).
			Updates(map[string]interface{}{
				"balance": newBalance,
				"version": gorm.Expr("version + 1"),
			}).Error; err != nil {
			return err
		}

		// Create immutable transaction record
		transaction := &db.CreditTransaction{
			UserID:    userID,
			TaskID:    taskID,
			Type:      string(db.TransactionTypeUsage),
			Amount:    requiredCredits, // Positive means deducted
			Reason:    fmt.Sprintf("Download %d GB", downloadSizeGB),
			CreatedAt: time.Now(),
		}
		if err := tx.Create(transaction).Error; err != nil {
			m.logger.Error("failed to create credit transaction",
				zap.Int64("user_id", userID),
				zap.String("task_id", taskID),
				zap.Error(err),
			)
			return err
		}

		m.logger.Info("credits deducted",
			zap.Int64("user_id", userID),
			zap.String("task_id", taskID),
			zap.Int64("amount", requiredCredits),
			zap.Int64("remaining", newBalance),
		)

		return nil
	})
}

// RefundCredits refunds credits when download fails
// Uses SELECT FOR UPDATE for atomic operation
func (m *Manager) RefundCredits(ctx context.Context, userID int64, taskID string, downloadSizeGB int64) error {
	refundAmount := downloadSizeGB

	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the credit row
		var credit db.Credit
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).
			First(&credit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				m.logger.Error("credit record not found for refund",
					zap.Int64("user_id", userID),
				)
				return ErrCreditNotFound
			}
			return err
		}

		// Add credits back
		newBalance := credit.Balance + refundAmount
		if err := tx.Model(&db.Credit{}).
			Where("user_id = ? AND version = ?", userID, credit.Version).
			Updates(map[string]interface{}{
				"balance": newBalance,
				"version": gorm.Expr("version + 1"),
			}).Error; err != nil {
			return err
		}

		// Create immutable refund transaction record
		transaction := &db.CreditTransaction{
			UserID:    userID,
			TaskID:    taskID,
			Type:      string(db.TransactionTypeRefund),
			Amount:    -refundAmount, // Negative means refunded
			Reason:    fmt.Sprintf("Download failed: %d GB refunded", downloadSizeGB),
			CreatedAt: time.Now(),
		}
		if err := tx.Create(transaction).Error; err != nil {
			m.logger.Error("failed to create refund transaction",
				zap.Int64("user_id", userID),
				zap.String("task_id", taskID),
				zap.Error(err),
			)
			return err
		}

		m.logger.Info("credits refunded",
			zap.Int64("user_id", userID),
			zap.String("task_id", taskID),
			zap.Int64("amount", refundAmount),
			zap.Int64("remaining", newBalance),
		)

		return nil
	})
}

// AdminAdjustCredits adjusts credits by admin with audit trail
// Uses SELECT FOR UPDATE for atomic operation
func (m *Manager) AdminAdjustCredits(ctx context.Context, userID int64, adminID int64, amount int64, reason string) error {
	if amount == 0 {
		return errors.New("adjustment amount cannot be zero")
	}

	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Lock the credit row
		var credit db.Credit
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).
			First(&credit).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				m.logger.Error("credit record not found for admin adjustment",
					zap.Int64("user_id", userID),
				)
				return ErrCreditNotFound
			}
			return err
		}

		// Calculate new balance
		newBalance := credit.Balance + amount
		if newBalance < 0 {
			return errors.New("admin adjustment would result in negative balance")
		}

		// Update balance
		if err := tx.Model(&db.Credit{}).
			Where("user_id = ? AND version = ?", userID, credit.Version).
			Updates(map[string]interface{}{
				"balance": newBalance,
				"version": gorm.Expr("version + 1"),
			}).Error; err != nil {
			return err
		}

		// Create immutable admin adjustment transaction record
		transaction := &db.CreditTransaction{
			UserID:    userID,
			Type:      string(db.TransactionTypeAdminAdjust),
			Amount:    amount,
			Reason:    reason,
			AdminID:   adminID,
			CreatedAt: time.Now(),
		}
		if err := tx.Create(transaction).Error; err != nil {
			m.logger.Error("failed to create admin adjustment transaction",
				zap.Int64("user_id", userID),
				zap.Int64("admin_id", adminID),
				zap.Error(err),
			)
			return err
		}

		m.logger.Info("credits adjusted by admin",
			zap.Int64("user_id", userID),
			zap.Int64("admin_id", adminID),
			zap.Int64("amount", amount),
			zap.Int64("remaining", newBalance),
			zap.String("reason", reason),
		)

		return nil
	})
}

// GetTransactionHistory retrieves credit transaction history for a user
func (m *Manager) GetTransactionHistory(ctx context.Context, userID int64, limit int, offset int) ([]db.CreditTransaction, error) {
	var transactions []db.CreditTransaction
	if err := m.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&transactions).Error; err != nil {
		m.logger.Error("failed to get transaction history",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return nil, err
	}

	return transactions, nil
}

// InitializeUserCredits creates a credit record for a new user with initial amount
func (m *Manager) InitializeUserCredits(ctx context.Context, userID int64, initialAmount int64) error {
	credit := &db.Credit{
		UserID:    userID,
		Balance:   initialAmount,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}

	if err := m.db.WithContext(ctx).Create(credit).Error; err != nil {
		m.logger.Error("failed to initialize user credits",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return err
	}

	m.logger.Info("user credits initialized",
		zap.Int64("user_id", userID),
		zap.Int64("amount", initialAmount),
	)

	return nil
}
