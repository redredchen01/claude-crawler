package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/testutil"
)

func setupAuthTest(t *testing.T) (*gorm.DB, *auth.KeyManager, string, int64) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create user
	userMgr := auth.NewUserManager(dbConn)
	user, err := userMgr.CreateUser("testuser")
	require.NoError(t, err, "failed to create test user")

	// Create API key
	keyMgr := auth.NewKeyManager(dbConn)
	key, err := keyMgr.CreateKey(user.ID, "test-key")
	require.NoError(t, err, "failed to create test key")

	return dbConn, keyMgr, key, user.ID
}

func TestAuthMiddleware_ValidBearerToken(t *testing.T) {
	dbConn, _, validKey, expectedUserID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create middleware and handler
	middleware := AuthMiddleware(dbConn, logger)
	var capturedUserID int64
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := WithUserContext(r)
		assert.True(t, ok, "user_id should be in context")
		capturedUserID = userID
		w.WriteHeader(http.StatusOK)
	}))

	// Test request with valid Bearer token
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "request should succeed")
	assert.Equal(t, expectedUserID, capturedUserID, "user_id should match")
}

func TestAuthMiddleware_MissingAuthorizationHeader(t *testing.T) {
	dbConn, _, _, _ := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	middleware := AuthMiddleware(dbConn, logger)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test request without Authorization header
	req := httptest.NewRequest("GET", "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code, "should return 400 for missing header")
	assert.Contains(t, w.Body.String(), "missing authorization header")
}

func TestAuthMiddleware_InvalidAuthorizationFormat(t *testing.T) {
	dbConn, _, _, _ := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	middleware := AuthMiddleware(dbConn, logger)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	testCases := []struct {
		name        string
		authHeader  string
		expectedErr string
	}{
		{
			name:        "missing bearer prefix",
			authHeader:  "Basic sometoken",
			expectedErr: "invalid authorization format",
		},
		{
			name:        "malformed header",
			authHeader:  "Bearer",
			expectedErr: "invalid authorization format",
		},
		{
			name:        "only bearer prefix",
			authHeader:  "Bearer ",
			expectedErr: "empty bearer token",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/test", nil)
			req.Header.Set("Authorization", tc.authHeader)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			assert.Equal(t, http.StatusBadRequest, w.Code, "should return 400 for malformed header")
			assert.Contains(t, w.Body.String(), tc.expectedErr)
		})
	}
}

func TestAuthMiddleware_InvalidAPIKey(t *testing.T) {
	dbConn, _, _, _ := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	middleware := AuthMiddleware(dbConn, logger)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test request with invalid key
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer 0000000000000000000000000000000000000000000000000000000000000000")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code, "should return 401 for invalid key")
	assert.Contains(t, w.Body.String(), "invalid or revoked api key")
}

func TestAuthMiddleware_RevokedAPIKey(t *testing.T) {
	dbConn, keyMgr, validKey, _ := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Get the key and revoke it
	var apiKey db.APIKey
	err := dbConn.Where("key_hash IS NOT NULL").First(&apiKey).Error
	require.NoError(t, err, "failed to find api key")
	require.NoError(t, keyMgr.RevokeKey(apiKey.ID), "failed to revoke key")

	middleware := AuthMiddleware(dbConn, logger)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test request with revoked key
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code, "should return 401 for revoked key")
	assert.Contains(t, w.Body.String(), "invalid or revoked api key")
}

func TestAuthMiddleware_InactiveUser(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Deactivate the user
	userMgr := auth.NewUserManager(dbConn)
	require.NoError(t, userMgr.DeactivateUser(userID), "failed to deactivate user")

	middleware := AuthMiddleware(dbConn, logger)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test request with key from inactive user
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code, "should return 401 for inactive user")
	assert.Contains(t, w.Body.String(), "invalid or revoked api key")
}

func TestWithUserContext_ContextValueExists(t *testing.T) {
	ctx := context.WithValue(context.Background(), UserIDKey, int64(42))
	req := httptest.NewRequest("GET", "/api/test", nil)
	req = req.WithContext(ctx)

	userID, ok := WithUserContext(req)

	assert.True(t, ok, "should find user_id in context")
	assert.Equal(t, int64(42), userID, "user_id should match")
}

func TestWithUserContext_ContextValueMissing(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test", nil)

	userID, ok := WithUserContext(req)

	assert.False(t, ok, "should not find user_id in context")
	assert.Equal(t, int64(0), userID, "user_id should be zero value")
}

func TestAuthMiddleware_ContextAttachedToRequest(t *testing.T) {
	dbConn, _, validKey, expectedUserID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	middleware := AuthMiddleware(dbConn, logger)
	var ctxUserID int64
	var ctxOk bool
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctxUserID, ctxOk = WithUserContext(r)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.True(t, ctxOk, "context should have user_id")
	assert.Equal(t, expectedUserID, ctxUserID, "user_id should be attached to context")
}

func TestAuthMiddleware_IntegrationWithMultipleUsers(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create two users with keys
	userMgr := auth.NewUserManager(dbConn)
	user1, err := userMgr.CreateUser("user1")
	require.NoError(t, err)
	user2, err := userMgr.CreateUser("user2")
	require.NoError(t, err)

	keyMgr := auth.NewKeyManager(dbConn)
	key1, err := keyMgr.CreateKey(user1.ID, "key1")
	require.NoError(t, err)
	key2, err := keyMgr.CreateKey(user2.ID, "key2")
	require.NoError(t, err)

	middleware := AuthMiddleware(dbConn, logger)

	// Test key1 authenticates as user1
	handler1 := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := WithUserContext(r)
		assert.True(t, ok)
		assert.Equal(t, user1.ID, userID)
		w.WriteHeader(http.StatusOK)
	}))

	req1 := httptest.NewRequest("GET", "/api/test", nil)
	req1.Header.Set("Authorization", "Bearer "+key1)
	w1 := httptest.NewRecorder()
	handler1.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Test key2 authenticates as user2
	handler2 := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := WithUserContext(r)
		assert.True(t, ok)
		assert.Equal(t, user2.ID, userID)
		w.WriteHeader(http.StatusOK)
	}))

	req2 := httptest.NewRequest("GET", "/api/test", nil)
	req2.Header.Set("Authorization", "Bearer "+key2)
	w2 := httptest.NewRecorder()
	handler2.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code)
}

func TestQuotaCheckMiddleware_WithinQuota(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create quota at 50% usage (ensure reset_date is 1st of current month)
	now := time.Now().UTC()
	resetDate := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	quota := &db.Quota{
		UserID:               userID,
		DownloadedBytesMonth: 500 * 1024 * 1024, // 500 MB
		QuotaLimitBytes:      1099511627776,     // 1 TB
		QuotaResetDate:       resetDate,
	}
	require.NoError(t, dbConn.Create(quota).Error)

	// Create middleware chain
	authMW := AuthMiddleware(dbConn, logger)
	quotaMW := QuotaCheckMiddleware(dbConn, logger)

	// Handler that runs if quotas allow
	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	// Chain: auth -> quota -> handler
	handler := authMW(quotaMW(nextHandler))

	// Make request
	req := httptest.NewRequest("POST", "/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "should allow request when within quota")
	assert.True(t, handlerCalled, "handler should be called")
}

func TestQuotaCheckMiddleware_ExceededQuota(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create quota at 100%+ usage (ensure reset_date is 1st of current month)
	now := time.Now().UTC()
	resetDate := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	quota := &db.Quota{
		UserID:               userID,
		DownloadedBytesMonth: 1099511627776 + 1, // Over 1 TB limit
		QuotaLimitBytes:      1099511627776,     // 1 TB
		QuotaResetDate:       resetDate,
	}
	require.NoError(t, dbConn.Create(quota).Error)

	// Create middleware chain
	authMW := AuthMiddleware(dbConn, logger)
	quotaMW := QuotaCheckMiddleware(dbConn, logger)

	// Handler that should NOT run
	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	// Chain: auth -> quota -> handler
	handler := authMW(quotaMW(nextHandler))

	// Make request
	req := httptest.NewRequest("POST", "/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInsufficientStorage, w.Code, "should return 507 when quota exceeded")
	assert.False(t, handlerCalled, "handler should NOT be called when quota exceeded")
	assert.Contains(t, w.Body.String(), "storage quota exceeded")
}

func TestQuotaCheckMiddleware_NoUserIDInContext(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	quotaMW := QuotaCheckMiddleware(dbConn, logger)

	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := quotaMW(nextHandler)

	// Request without user_id in context
	req := httptest.NewRequest("POST", "/tasks", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code, "should return 500 when user_id missing from context")
	assert.False(t, handlerCalled, "handler should NOT be called")
}

func TestQuotaCheckMiddleware_CreatesDefaultQuotaIfMissing(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// No quota created for this user

	// Create middleware chain
	authMW := AuthMiddleware(dbConn, logger)
	quotaMW := QuotaCheckMiddleware(dbConn, logger)

	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := authMW(quotaMW(nextHandler))

	// Make request
	req := httptest.NewRequest("POST", "/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "should allow when quota missing (creates default)")
	assert.True(t, handlerCalled, "handler should be called")

	// Verify default quota was created
	var quota db.Quota
	err := dbConn.Where("user_id = ?", userID).First(&quota).Error
	assert.NoError(t, err, "default quota should be created")
	assert.Equal(t, int64(0), quota.DownloadedBytesMonth)
}

// Credit Check Middleware Tests (Unit 3)

func TestCreditCheckMiddleware_WithSufficientCredits(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create credit record with 100 credits
	credit := &db.Credit{
		UserID:    userID,
		Balance:   100,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}
	require.NoError(t, dbConn.Create(credit).Error)

	// Create middleware chain
	authMW := AuthMiddleware(dbConn, logger)
	creditMW := CreditCheckMiddleware(dbConn, logger)

	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	// Chain: auth -> credit -> handler
	handler := authMW(creditMW(nextHandler))

	// Make request
	req := httptest.NewRequest("POST", "/api/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "should allow request when credits sufficient")
	assert.True(t, handlerCalled, "handler should be called")
}

func TestCreditCheckMiddleware_WithInsufficientCredits(t *testing.T) {
	dbConn, _, validKey, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create credit record with 0 credits
	credit := &db.Credit{
		UserID:    userID,
		Balance:   0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}
	require.NoError(t, dbConn.Create(credit).Error)

	// Create middleware chain
	authMW := AuthMiddleware(dbConn, logger)
	creditMW := CreditCheckMiddleware(dbConn, logger)

	var handlerCalled bool
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	// Chain: auth -> credit -> handler
	handler := authMW(creditMW(nextHandler))

	// Make request
	req := httptest.NewRequest("POST", "/api/tasks", nil)
	req.Header.Set("Authorization", "Bearer "+validKey)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInsufficientStorage, w.Code, "should return 507 when credits insufficient")
	assert.False(t, handlerCalled, "handler should NOT be called")
	assert.Contains(t, w.Body.String(), "insufficient credits")
}

func TestCreditCheckMiddleware_DeductCreditsAfterSuccessfulDownload(t *testing.T) {
	dbConn, _, _, userID := setupAuthTest(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create credit record with 100 credits
	credit := &db.Credit{
		UserID:    userID,
		Balance:   100,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}
	require.NoError(t, dbConn.Create(credit).Error)

	bm := billing.NewManager(dbConn, logger)

	// Deduct credits for a download
	taskID := "test-task-001"
	err := bm.DeductCredits(context.Background(), userID, taskID, 10)
	require.NoError(t, err, "should successfully deduct credits")

	// Verify balance
	balance, err := bm.GetBalance(context.Background(), userID)
	assert.NoError(t, err)
	assert.Equal(t, int64(90), balance, "balance should be reduced by 10")

	// Verify transaction record created
	var transactions []db.CreditTransaction
	err = dbConn.Where("user_id = ? AND task_id = ?", userID, taskID).Find(&transactions).Error
	assert.NoError(t, err)
	assert.Len(t, transactions, 1, "one transaction should be recorded")
	assert.Equal(t, string(db.TransactionTypeUsage), transactions[0].Type)
	assert.Equal(t, int64(10), transactions[0].Amount)
}

func TestCreditCheckMiddleware_RefundOnDownloadFailure(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create user
	userMgr := auth.NewUserManager(dbConn)
	user, errCreate := userMgr.CreateUser("testuser_refund")
	require.NoError(t, errCreate)
	userID := user.ID

	// Create credit record with 100 credits
	credit := &db.Credit{
		UserID:    userID,
		Balance:   100,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}
	require.NoError(t, dbConn.Create(credit).Error)

	bm := billing.NewManager(dbConn, logger)

	// Deduct credits
	taskID := "test-task-002"
	err := bm.DeductCredits(context.Background(), userID, taskID, 20)
	require.NoError(t, err)

	// Verify balance after deduction
	balance, err := bm.GetBalance(context.Background(), userID)
	require.NoError(t, err)
	assert.Equal(t, int64(80), balance)

	// Refund credits due to download failure
	err = bm.RefundCredits(context.Background(), userID, taskID, 20)
	require.NoError(t, err)

	// Verify balance after refund
	balance, err = bm.GetBalance(context.Background(), userID)
	assert.NoError(t, err)
	assert.Equal(t, int64(100), balance, "balance should be restored after refund")

	// Verify both transaction records
	var transactions []db.CreditTransaction
	err = dbConn.Where("user_id = ? AND task_id = ?", userID, taskID).
		Order("created_at").
		Find(&transactions).Error
	assert.NoError(t, err)
	assert.Len(t, transactions, 2, "two transactions should be recorded")
	assert.Equal(t, string(db.TransactionTypeUsage), transactions[0].Type)
	assert.Equal(t, string(db.TransactionTypeRefund), transactions[1].Type)
}

func TestCreditCheckMiddleware_AdminAdjustCredits(t *testing.T) {
	dbConn := testutil.SetupTestDB(t)
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create user
	userMgr := auth.NewUserManager(dbConn)
	user, errCreate := userMgr.CreateUser("testuser_admin")
	require.NoError(t, errCreate)
	userID := user.ID

	// Create credit record
	credit := &db.Credit{
		UserID:    userID,
		Balance:   50,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Version:   0,
	}
	require.NoError(t, dbConn.Create(credit).Error)

	bm := billing.NewManager(dbConn, logger)
	adminID := int64(999) // Admin user ID

	// Admin adds 50 credits
	reason := "Promotional bonus"
	err := bm.AdminAdjustCredits(context.Background(), userID, adminID, 50, reason)
	require.NoError(t, err)

	// Verify balance
	balance, err := bm.GetBalance(context.Background(), userID)
	assert.NoError(t, err)
	assert.Equal(t, int64(100), balance)

	// Verify transaction record
	var transaction db.CreditTransaction
	err = dbConn.Where("user_id = ? AND type = ?", userID, string(db.TransactionTypeAdminAdjust)).
		First(&transaction).Error
	assert.NoError(t, err)
	assert.Equal(t, adminID, transaction.AdminID)
	assert.Equal(t, reason, transaction.Reason)
	assert.Equal(t, int64(50), transaction.Amount)
}
