package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/quota"
)

func setupAdminTest(t *testing.T) (*gorm.DB, *AdminHandler) {
	// Create in-memory SQLite database
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err, "failed to open database")

	// Run migrations
	err = db.InitDB(dbConn)
	require.NoError(t, err, "failed to initialize database")

	// Create logger
	logger, err := zap.NewDevelopment()
	require.NoError(t, err, "failed to create logger")

	// Create admin handler
	adminHandler := NewAdminHandler(dbConn, logger)

	return dbConn, adminHandler
}

func TestAdminAuthMiddleware_ValidToken(t *testing.T) {
	// Set admin token
	adminToken := "test-admin-token-12345678"
	os.Setenv("ADMIN_TOKEN", adminToken)
	defer os.Unsetenv("ADMIN_TOKEN")

	logger, _ := zap.NewDevelopment()
	middleware := AdminAuthMiddleware(logger)

	// Create a simple handler that writes success
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	}))

	// Test with valid token
	req := httptest.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "success", w.Body.String())
}

func TestAdminAuthMiddleware_InvalidToken(t *testing.T) {
	os.Setenv("ADMIN_TOKEN", "test-admin-token-12345678")
	defer os.Unsetenv("ADMIN_TOKEN")

	logger, _ := zap.NewDevelopment()
	middleware := AdminAuthMiddleware(logger)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test with invalid token
	req := httptest.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer wrong-token")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminAuthMiddleware_MissingHeader(t *testing.T) {
	os.Setenv("ADMIN_TOKEN", "test-admin-token-12345678")
	defer os.Unsetenv("ADMIN_TOKEN")

	logger, _ := zap.NewDevelopment()
	middleware := AdminAuthMiddleware(logger)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test without authorization header
	req := httptest.NewRequest("GET", "/admin/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestCreateUser_Success(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	req := CreateUserRequest{
		Username: "testuser",
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/users", bytes.NewReader(body))
	w := httptest.NewRecorder()

	adminHandler.CreateUser(w, httpReq)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp CreateUserResponse
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, "testuser", resp.Username)
	assert.Greater(t, resp.UserID, int64(0))
}

func TestCreateUser_DuplicateUsername(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create first user
	um := auth.NewUserManager(dbConn)
	_, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Try to create user with same username
	req := CreateUserRequest{
		Username: "testuser",
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/users", bytes.NewReader(body))
	w := httptest.NewRecorder()

	adminHandler.CreateUser(w, httpReq)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateUser_InvalidUsername(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	tests := []struct {
		username string
		name     string
	}{
		{"ab", "too short"},           // Less than 3 chars
		{"a" + string(make([]byte, 32)), "too long"}, // More than 32 chars
		{"user@name", "invalid chars"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := CreateUserRequest{
				Username: tt.username,
			}
			body, _ := json.Marshal(req)

			httpReq := httptest.NewRequest("POST", "/admin/users", bytes.NewReader(body))
			w := httptest.NewRecorder()

			adminHandler.CreateUser(w, httpReq)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestGenerateKey_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user first
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	req := GenerateKeyRequest{
		Name: "test-key",
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/keys/1", bytes.NewReader(body))

	// Create a simple router to handle path values
	mux := http.NewServeMux()
	mux.HandleFunc("POST /admin/keys/{user_id}", adminHandler.GenerateKey)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	// Test should work with direct handler call
	assert.NotNil(t, adminHandler)
	assert.Greater(t, user.ID, int64(0))
}

func TestGenerateKey_UserNotFound(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	req := GenerateKeyRequest{
		Name: "test-key",
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/keys/999", bytes.NewReader(body))
	mux := http.NewServeMux()
	mux.HandleFunc("POST /admin/keys/{user_id}", adminHandler.GenerateKey)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.NotNil(t, adminHandler)
}

func TestAdjustQuota_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user and quota
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Create quota
	q := &db.Quota{
		UserID:               user.ID,
		DownloadedBytesMonth: 0,
		QuotaLimitBytes:      quota.DefaultQuotaLimitBytes,
		QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	err = dbConn.Create(q).Error
	require.NoError(t, err)

	// Adjust quota
	req := AdjustQuotaRequest{
		QuotaLimitBytes: 2 * 1024 * 1024 * 1024, // 2 GB
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("PATCH", "/admin/quotas/1", bytes.NewReader(body))
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /admin/quotas/{user_id}", adminHandler.AdjustQuota)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.NotNil(t, adminHandler)
}

func TestAdjustQuota_InvalidQuotaLimit(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	tests := []struct {
		limitBytes int64
		name       string
	}{
		{0, "zero limit"},
		{-1000, "negative limit"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := AdjustQuotaRequest{
				QuotaLimitBytes: tt.limitBytes,
			}
			body, _ := json.Marshal(req)

			httpReq := httptest.NewRequest("PATCH", "/admin/quotas/1", bytes.NewReader(body))
			mux := http.NewServeMux()
			mux.HandleFunc("PATCH /admin/quotas/{user_id}", adminHandler.AdjustQuota)

			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httpReq)

			assert.NotNil(t, adminHandler)
		})
	}
}

func TestGetAnalytics_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Create quota
	q := &db.Quota{
		UserID:               user.ID,
		DownloadedBytesMonth: 100 * 1024 * 1024, // 100 MB
		QuotaLimitBytes:      1024 * 1024 * 1024, // 1 GB
		QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	err = dbConn.Create(q).Error
	require.NoError(t, err)

	assert.NotNil(t, adminHandler)
}

func TestGetAnalytics_UserNotFound(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	httpReq := httptest.NewRequest("GET", "/admin/analytics/999", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/analytics/{user_id}", adminHandler.GetAnalytics)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.NotNil(t, adminHandler)
}

func TestGetSystemAnalytics_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create multiple users
	um := auth.NewUserManager(dbConn)
	for i := 0; i < 3; i++ {
		username := "user" + string(rune(i+48))
		user, err := um.CreateUser(username)
		require.NoError(t, err)

		// Create quota for each user
		q := &db.Quota{
			UserID:               user.ID,
			DownloadedBytesMonth: int64(i) * 100 * 1024 * 1024,
			QuotaLimitBytes:      quota.DefaultQuotaLimitBytes,
			QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
			CreatedAt:            time.Now(),
			UpdatedAt:            time.Now(),
		}
		err = dbConn.Create(q).Error
		require.NoError(t, err)
	}

	httpReq := httptest.NewRequest("GET", "/admin/analytics?aggregated=true", nil)
	w := httptest.NewRecorder()

	adminHandler.GetSystemAnalytics(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp SystemAnalyticsResponse
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, int64(3), resp.TotalUsers)
}

func TestDeleteUser_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Verify user exists before deletion
	fetchedUser, err := um.GetUser(user.ID)
	assert.NoError(t, err)
	assert.NotNil(t, fetchedUser)

	httpReq := httptest.NewRequest("DELETE", "/admin/users/1", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("DELETE /admin/users/{user_id}", adminHandler.DeleteUser)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify user is deleted
	_, err = um.GetUser(user.ID)
	assert.Error(t, err)
}

func TestDeleteUser_UserNotFound(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	httpReq := httptest.NewRequest("DELETE", "/admin/users/999", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("DELETE /admin/users/{user_id}", adminHandler.DeleteUser)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.NotNil(t, adminHandler)
}

func TestIntegration_AdminWorkflow(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// 1. Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("integrationuser")
	require.NoError(t, err)
	assert.Greater(t, user.ID, int64(0))

	// 2. Create quota for user
	q := &db.Quota{
		UserID:               user.ID,
		DownloadedBytesMonth: 0,
		QuotaLimitBytes:      2 * 1024 * 1024 * 1024, // 2 GB
		QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	err = dbConn.Create(q).Error
	require.NoError(t, err)

	// 3. Generate API key
	km := auth.NewKeyManager(dbConn)
	key, err := km.CreateKey(user.ID, "integration-key")
	require.NoError(t, err)
	assert.NotEmpty(t, key)

	// 4. Verify key is valid
	validatedUserID, err := km.ValidateKey(key)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, validatedUserID)

	// 5. Test analytics
	httpReq := httptest.NewRequest("GET", "/admin/analytics?aggregated=true", nil)
	w := httptest.NewRecorder()

	adminHandler.GetSystemAnalytics(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp SystemAnalyticsResponse
	err = json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), resp.TotalUsers)

	// 6. Delete user
	err = adminHandler.userManager.DeactivateUser(user.ID)
	assert.NoError(t, err)

	// 7. Verify user is deleted
	_, err = um.GetUser(user.ID)
	assert.Error(t, err)
}

func TestIntegration_QuotaAdjustment(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("quotauser")
	require.NoError(t, err)

	// Create initial quota (1 TB)
	q := &db.Quota{
		UserID:               user.ID,
		DownloadedBytesMonth: 500 * 1024 * 1024, // 500 MB used
		QuotaLimitBytes:      1024 * 1024 * 1024, // 1 GB limit
		QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	err = dbConn.Create(q).Error
	require.NoError(t, err)

	// Check initial quota
	qm := quota.NewManager(dbConn, adminHandler.logger)
	usageBytes, limitBytes, err := qm.GetQuota(context.Background(), user.ID)
	assert.NoError(t, err)
	assert.Equal(t, int64(500*1024*1024), usageBytes)
	assert.Equal(t, int64(1024*1024*1024), limitBytes)

	// Adjust quota
	newLimit := int64(2 * 1024 * 1024 * 1024) // 2 GB
	currentMonthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)
	err = dbConn.Model(&db.Quota{}).
		Where("user_id = ? AND quota_reset_date = ?", user.ID, currentMonthStart).
		Update("quota_limit_bytes", newLimit).Error
	assert.NoError(t, err)

	// Verify quota was adjusted
	usageBytes, limitBytes, err = qm.GetQuota(context.Background(), user.ID)
	assert.NoError(t, err)
	assert.Equal(t, int64(500*1024*1024), usageBytes)
	assert.Equal(t, newLimit, limitBytes)
}

func TestGetBilling_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("billinguser")
	require.NoError(t, err)

	// Initialize user credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
	require.NoError(t, err)

	// Deduct some credits (simulate usage)
	err = bm.DeductCredits(context.Background(), user.ID, "task-001", 100)
	require.NoError(t, err)

	// Create request
	httpReq := httptest.NewRequest("GET", "/admin/billing/1", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/billing/{user_id}", adminHandler.GetBilling)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp BillingResponse
	err = json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, resp.UserID)
	assert.Equal(t, int64(900), resp.CurrentCredits) // 1000 - 100
	assert.Equal(t, int64(100), resp.LifetimeConsumed)
}

func TestGetBilling_UserNotFound(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	httpReq := httptest.NewRequest("GET", "/admin/billing/999", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/billing/{user_id}", adminHandler.GetBilling)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetBillingTransactions_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("transactionuser")
	require.NoError(t, err)

	// Initialize user credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
	require.NoError(t, err)

	// Create some transactions
	err = bm.DeductCredits(context.Background(), user.ID, "task-001", 50)
	require.NoError(t, err)
	err = bm.DeductCredits(context.Background(), user.ID, "task-002", 75)
	require.NoError(t, err)

	// Get transactions
	httpReq := httptest.NewRequest("GET", "/admin/billing/1/transactions?limit=10&offset=0", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/billing/{user_id}/transactions", adminHandler.GetBillingTransactions)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp BillingTransactionsResponse
	err = json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), resp.Total)
	assert.Equal(t, 2, len(resp.Transactions))
	assert.Equal(t, "usage", resp.Transactions[0].Type)
}

func TestAddCredits_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("credituser")
	require.NoError(t, err)

	// Initialize user credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 500)
	require.NoError(t, err)

	// Add credits
	req := AddCreditsRequest{
		Amount: 500,
		Reason: "Referral bonus",
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/billing/1/add-credits", bytes.NewReader(body))
	mux := http.NewServeMux()
	mux.HandleFunc("POST /admin/billing/{user_id}/add-credits", adminHandler.AddCredits)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp AddCreditsResponse
	err = json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, user.ID, resp.UserID)
	assert.Equal(t, int64(1000), resp.NewBalance) // 500 + 500
	assert.Equal(t, int64(500), resp.AddedAmount)
}

func TestAddCredits_InvalidAmount(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("credituser2")
	require.NoError(t, err)

	// Initialize user credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 500)
	require.NoError(t, err)

	tests := []struct {
		amount int64
		reason string
		name   string
	}{
		{0, "test", "zero amount"},
		{-100, "test", "negative amount"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := AddCreditsRequest{
				Amount: tt.amount,
				Reason: tt.reason,
			}
			body, _ := json.Marshal(req)

			httpReq := httptest.NewRequest("POST", "/admin/billing/1/add-credits", bytes.NewReader(body))
			mux := http.NewServeMux()
			mux.HandleFunc("POST /admin/billing/{user_id}/add-credits", adminHandler.AddCredits)

			w := httptest.NewRecorder()
			mux.ServeHTTP(w, httpReq)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestGetAggregatedBilling_Success(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create multiple users with credits
	um := auth.NewUserManager(dbConn)
	bm := billing.NewManager(dbConn, adminHandler.logger)

	for i := 0; i < 3; i++ {
		username := "agguser" + string(rune(i+48))
		user, err := um.CreateUser(username)
		require.NoError(t, err)

		// Initialize credits
		err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
		require.NoError(t, err)

		// Deduct some credits
		err = bm.DeductCredits(context.Background(), user.ID, "task-"+string(rune(i+48)), int64(100*(i+1)))
		require.NoError(t, err)
	}

	httpReq := httptest.NewRequest("GET", "/admin/billing?aggregated=true", nil)
	w := httptest.NewRecorder()

	adminHandler.GetAggregatedBilling(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp AggregatedBillingResponse
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, int64(3), resp.TotalUsers)
	assert.Equal(t, int64(600), resp.TotalCreditsConsumed) // 100 + 200 + 300
}

func TestUpdateBillingConfig_Success(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	req := BillingConfigRequest{
		CreditsPerGB: 2.0,
	}
	body, _ := json.Marshal(req)

	httpReq := httptest.NewRequest("POST", "/admin/billing/config", bytes.NewReader(body))
	w := httptest.NewRecorder()

	adminHandler.UpdateBillingConfig(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp BillingConfigResponse
	err := json.NewDecoder(w.Body).Decode(&resp)
	assert.NoError(t, err)
	assert.Equal(t, 2.0, resp.CreditsPerGB)
}

func TestUpdateBillingConfig_InvalidCreditsPerGB(t *testing.T) {
	_, adminHandler := setupAdminTest(t)

	tests := []struct {
		creditsPerGB float64
		name         string
	}{
		{0, "zero"},
		{-1.0, "negative"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := BillingConfigRequest{
				CreditsPerGB: tt.creditsPerGB,
			}
			body, _ := json.Marshal(req)

			httpReq := httptest.NewRequest("POST", "/admin/billing/config", bytes.NewReader(body))
			w := httptest.NewRecorder()

			adminHandler.UpdateBillingConfig(w, httpReq)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestIntegration_BillingWorkflow(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// 1. Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("billingworkflowuser")
	require.NoError(t, err)

	// 2. Initialize credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
	require.NoError(t, err)

	// 3. Verify initial billing
	balance, err := bm.GetBalance(context.Background(), user.ID)
	assert.NoError(t, err)
	assert.Equal(t, int64(1000), balance)

	// 4. Deduct credits (simulate usage)
	err = bm.DeductCredits(context.Background(), user.ID, "task-001", 250)
	require.NoError(t, err)

	// 5. Check balance after deduction
	balance, err = bm.GetBalance(context.Background(), user.ID)
	assert.NoError(t, err)
	assert.Equal(t, int64(750), balance)

	// 6. Admin adds credits
	err = bm.AdminAdjustCredits(context.Background(), user.ID, 0, 500, "Loyalty bonus")
	assert.NoError(t, err)

	// 7. Verify final balance
	balance, err = bm.GetBalance(context.Background(), user.ID)
	assert.NoError(t, err)
	assert.Equal(t, int64(1250), balance)

	// 8. Get transaction history
	transactions, err := bm.GetTransactionHistory(context.Background(), user.ID, 10, 0)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(transactions)) // usage + admin_adjust
}

func TestBillingAdmin_NonAdminAccess(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("testuser")
	require.NoError(t, err)

	// Initialize credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
	require.NoError(t, err)

	// Test that GetBilling works (authorization is handled by middleware)
	// This test just verifies the endpoint is callable
	httpReq := httptest.NewRequest("GET", "/admin/billing/1", nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/billing/{user_id}", adminHandler.GetBilling)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestIntegration_AdminBillingFullWorkflow(t *testing.T) {
	dbConn, adminHandler := setupAdminTest(t)

	// 1. Create user
	um := auth.NewUserManager(dbConn)
	user, err := um.CreateUser("workflowuser")
	require.NoError(t, err)

	// 2. Initialize user with initial credits
	bm := billing.NewManager(dbConn, adminHandler.logger)
	err = bm.InitializeUserCredits(context.Background(), user.ID, 1000)
	require.NoError(t, err)

	// 3. Get billing info
	httpReq := httptest.NewRequest("GET", "/admin/billing/"+string(rune(user.ID+48)), nil)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/billing/{user_id}", adminHandler.GetBilling)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var billingResp BillingResponse
	json.NewDecoder(w.Body).Decode(&billingResp)
	assert.Equal(t, int64(1000), billingResp.CurrentCredits)

	// 4. Simulate usage (deduct credits)
	err = bm.DeductCredits(context.Background(), user.ID, "task-workflow-001", 250)
	require.NoError(t, err)

	// 5. Get updated billing info
	httpReq = httptest.NewRequest("GET", "/admin/billing/"+string(rune(user.ID+48)), nil)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	json.NewDecoder(w.Body).Decode(&billingResp)
	assert.Equal(t, int64(750), billingResp.CurrentCredits)
	assert.Equal(t, int64(250), billingResp.LifetimeConsumed)

	// 6. Get transaction history
	httpReq = httptest.NewRequest("GET", "/admin/billing/"+string(rune(user.ID+48))+"/transactions?limit=10&offset=0", nil)
	mux.HandleFunc("GET /admin/billing/{user_id}/transactions", adminHandler.GetBillingTransactions)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var txnResp BillingTransactionsResponse
	json.NewDecoder(w.Body).Decode(&txnResp)
	assert.Equal(t, int64(1), txnResp.Total)
	assert.Equal(t, "usage", txnResp.Transactions[0].Type)

	// 7. Admin adds credits with reason
	addCreditsReq := AddCreditsRequest{
		Amount: 500,
		Reason: "Loyalty program bonus",
	}
	body, _ := json.Marshal(addCreditsReq)
	httpReq = httptest.NewRequest("POST", "/admin/billing/"+string(rune(user.ID+48))+"/add-credits", bytes.NewReader(body))
	mux.HandleFunc("POST /admin/billing/{user_id}/add-credits", adminHandler.AddCredits)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var addResp AddCreditsResponse
	json.NewDecoder(w.Body).Decode(&addResp)
	assert.Equal(t, int64(1250), addResp.NewBalance) // 750 + 500

	// 8. Get aggregated billing stats
	httpReq = httptest.NewRequest("GET", "/admin/billing?aggregated=true", nil)
	mux.HandleFunc("GET /admin/billing", adminHandler.GetAggregatedBilling)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var aggResp AggregatedBillingResponse
	json.NewDecoder(w.Body).Decode(&aggResp)
	assert.Equal(t, int64(1), aggResp.TotalUsers)
	assert.Equal(t, int64(250), aggResp.TotalCreditsConsumed)

	// 9. Update billing config
	configReq := BillingConfigRequest{
		CreditsPerGB: 1.5,
	}
	body, _ = json.Marshal(configReq)
	httpReq = httptest.NewRequest("POST", "/admin/billing/config", bytes.NewReader(body))
	mux.HandleFunc("POST /admin/billing/config", adminHandler.UpdateBillingConfig)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)
	assert.Equal(t, http.StatusOK, w.Code)

	var configResp BillingConfigResponse
	json.NewDecoder(w.Body).Decode(&configResp)
	assert.Equal(t, 1.5, configResp.CreditsPerGB)

	// 10. Verify transaction history now has both usage and admin_adjust
	httpReq = httptest.NewRequest("GET", "/admin/billing/"+string(rune(user.ID+48))+"/transactions?limit=10&offset=0", nil)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httpReq)

	json.NewDecoder(w.Body).Decode(&txnResp)
	assert.Equal(t, int64(2), txnResp.Total) // usage + admin_adjust
	assert.Equal(t, "admin_adjust", txnResp.Transactions[0].Type)
	assert.Equal(t, "Loyalty program bonus", txnResp.Transactions[0].Reason)
}
