package testutil

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// SetupTestDB creates an in-memory SQLite database for testing
func SetupTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err, "failed to open test database")

	// Run migrations
	err = dbConn.AutoMigrate(
		&db.User{},
		&db.APIKey{},
		&db.DownloadSession{},
		&db.FileMetadata{},
		&db.RateLimit{},
		&db.Quota{},
		&db.Credit{},
		&db.CreditTransaction{},
		&db.BillingConfig{},
		&db.Webhook{},
		&db.WebhookDelivery{},
	)
	require.NoError(t, err, "failed to run migrations")

	return dbConn
}

// NewTestDB is an alias for SetupTestDB for convenience
func NewTestDB(t *testing.T) *gorm.DB {
	return SetupTestDB(t)
}
