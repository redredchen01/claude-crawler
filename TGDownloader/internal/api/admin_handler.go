package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/quota"
)

// AdminHandler handles admin API endpoints
type AdminHandler struct {
	db              *gorm.DB
	logger          *zap.Logger
	userManager     *auth.UserManager
	keyManager      *auth.KeyManager
	quotaManager    *quota.Manager
	billingManager  *billing.Manager
	adminToken      string
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(dbConn *gorm.DB, logger *zap.Logger) *AdminHandler {
	return &AdminHandler{
		db:              dbConn,
		logger:          logger,
		userManager:     auth.NewUserManager(dbConn),
		keyManager:      auth.NewKeyManager(dbConn),
		quotaManager:    quota.NewManager(dbConn, logger),
		billingManager:  billing.NewManager(dbConn, logger),
		adminToken:      os.Getenv("ADMIN_TOKEN"),
	}
}

// AdminAuthMiddleware validates admin token from Authorization header
// Returns 403 Forbidden if not admin
func AdminAuthMiddleware(logger *zap.Logger) func(http.Handler) http.Handler {
	adminToken := os.Getenv("ADMIN_TOKEN")
	if adminToken == "" {
		logger.Warn("ADMIN_TOKEN not set, admin endpoints will be inaccessible")
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")

			// Missing header
			if authHeader == "" {
				logger.Warn("missing authorization header for admin endpoint",
					zap.String("path", r.URL.Path),
				)
				writeError(w, http.StatusForbidden, "missing authorization header")
				return
			}

			// Parse Bearer token format
			var token string
			if _, err := fmt.Sscanf(authHeader, "Bearer %s", &token); err != nil {
				logger.Warn("invalid authorization format for admin endpoint",
					zap.String("path", r.URL.Path),
				)
				writeError(w, http.StatusForbidden, "invalid authorization format")
				return
			}

			// Check if token matches admin token
			if token != adminToken || adminToken == "" {
				logger.Warn("invalid admin token",
					zap.String("path", r.URL.Path),
				)
				writeError(w, http.StatusForbidden, "invalid or missing admin token")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CreateUserRequest represents user creation request
type CreateUserRequest struct {
	Username string `json:"username"`
}

// CreateUserResponse represents user creation response
type CreateUserResponse struct {
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateUser handles POST /admin/users
func (ah *AdminHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate request
	if req.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}

	// Create user
	createdUser, err := ah.userManager.CreateUser(req.Username)
	if err != nil {
		ah.logger.Error("failed to create user",
			zap.String("username", req.Username),
			zap.Error(err),
		)
		if err.Error() == "failed to create user: duplicate key value violates unique constraint \"users_username_key\"" {
			writeError(w, http.StatusBadRequest, "username already exists")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Initialize default quota for the user
	quotaRec := &db.Quota{
		UserID:               createdUser.ID,
		DownloadedBytesMonth: 0,
		QuotaLimitBytes:      quota.DefaultQuotaLimitBytes,
		QuotaResetDate:       time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}
	if err := ah.db.Create(quotaRec).Error; err != nil {
		ah.logger.Error("failed to create default quota",
			zap.Int64("user_id", createdUser.ID),
			zap.Error(err),
		)
		// Don't fail the entire operation if quota creation fails
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(CreateUserResponse{
		UserID:    createdUser.ID,
		Username:  createdUser.Username,
		CreatedAt: createdUser.CreatedAt,
	})

	ah.logger.Info("admin created user",
		zap.Int64("user_id", createdUser.ID),
		zap.String("username", createdUser.Username),
	)
}

// GenerateKeyRequest represents key generation request
type GenerateKeyRequest struct {
	Name string `json:"name,omitempty"`
}

// GenerateKeyResponse represents key generation response
type GenerateKeyResponse struct {
	KeyID     int64     `json:"key_id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// GenerateKey handles POST /admin/keys/{user_id}
func (ah *AdminHandler) GenerateKey(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Check if user exists
	_, err = ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Parse request
	var req GenerateKeyRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Generate key
	keyStr, err := ah.keyManager.CreateKey(userID, req.Name)
	if err != nil {
		ah.logger.Error("failed to generate key",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to generate key")
		return
	}

	// Get the created key from database to return key_id
	keys, err := ah.keyManager.ListUserKeys(userID)
	if err != nil || len(keys) == 0 {
		ah.logger.Error("failed to retrieve created key",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to retrieve created key")
		return
	}

	// Get the latest key (last one created)
	latestKey := keys[0]

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(GenerateKeyResponse{
		KeyID:     latestKey.ID,
		Key:       keyStr,
		Name:      latestKey.Name,
		CreatedAt: latestKey.CreatedAt,
	})

	ah.logger.Info("admin generated key",
		zap.Int64("user_id", userID),
		zap.String("key_name", req.Name),
	)
}

// AdjustQuotaRequest represents quota adjustment request
type AdjustQuotaRequest struct {
	QuotaLimitBytes int64 `json:"quota_limit_bytes"`
}

// AdjustQuotaResponse represents quota adjustment response
type AdjustQuotaResponse struct {
	UserID          int64 `json:"user_id"`
	QuotaLimitBytes int64 `json:"quota_limit_bytes"`
	UsedBytes       int64 `json:"used_bytes"`
	RemainingBytes  int64 `json:"remaining_bytes"`
}

// AdjustQuota handles PATCH /admin/quotas/{user_id}
func (ah *AdminHandler) AdjustQuota(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Check if user exists
	_, err = ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Parse request
	var req AdjustQuotaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate quota limit
	if req.QuotaLimitBytes <= 0 {
		writeError(w, http.StatusBadRequest, "quota_limit_bytes must be positive")
		return
	}

	// Update quota limit
	currentMonthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)
	if err := ah.db.Model(&db.Quota{}).
		Where("user_id = ? AND quota_reset_date = ?", userID, currentMonthStart).
		Update("quota_limit_bytes", req.QuotaLimitBytes).Error; err != nil {
		ah.logger.Error("failed to update quota",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to update quota")
		return
	}

	// Fetch updated quota
	usageBytes, limitBytes, err := ah.quotaManager.GetQuota(r.Context(), userID)
	if err != nil {
		ah.logger.Error("failed to fetch quota",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to fetch quota")
		return
	}

	remainingBytes := limitBytes - usageBytes
	if remainingBytes < 0 {
		remainingBytes = 0
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(AdjustQuotaResponse{
		UserID:          userID,
		QuotaLimitBytes: limitBytes,
		UsedBytes:       usageBytes,
		RemainingBytes:  remainingBytes,
	})

	ah.logger.Info("admin adjusted quota",
		zap.Int64("user_id", userID),
		zap.Int64("new_limit_bytes", req.QuotaLimitBytes),
	)
}

// AnalyticsResponse represents analytics data for a user
type AnalyticsResponse struct {
	UserID               int64  `json:"user_id"`
	Username             string `json:"username"`
	QuotaUsedBytes       int64  `json:"quota_used_bytes"`
	QuotaLimitBytes      int64  `json:"quota_limit_bytes"`
	QuotaRemainingBytes  int64  `json:"quota_remaining_bytes"`
	TotalDownloadedBytes int64  `json:"total_downloaded_bytes"`
	ActiveKeysCount      int    `json:"active_keys_count"`
	TasksCount           int    `json:"tasks_count"`
	FailedTasksCount     int    `json:"failed_tasks_count"`
	LastActivityAt       *time.Time `json:"last_activity_at,omitempty"`
}

// GetAnalytics handles GET /admin/analytics/{user_id}
func (ah *AdminHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Get user
	user, err := ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Get quota info
	usageBytes, limitBytes, err := ah.quotaManager.GetQuota(r.Context(), userID)
	if err != nil {
		ah.logger.Error("failed to fetch quota",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		usageBytes, limitBytes = 0, quota.DefaultQuotaLimitBytes
	}

	// Count active keys
	keys, _ := ah.keyManager.ListUserKeys(userID)
	activeKeysCount := len(keys)

	// Count tasks
	var tasksCount int64
	ah.db.Table("download_sessions").Where("user_id = ?", userID).Count(&tasksCount)

	// Count failed tasks
	var failedTasksCount int64
	ah.db.Table("download_sessions").Where("user_id = ? AND status IN ?", userID, []string{"failed", "error"}).Count(&failedTasksCount)

	// Get last activity
	var lastKey *db.APIKey
	ah.db.Where("user_id = ?", userID).Order("last_used_at DESC").Limit(1).First(&lastKey)

	remainingBytes := limitBytes - usageBytes
	if remainingBytes < 0 {
		remainingBytes = 0
	}

	resp := AnalyticsResponse{
		UserID:              userID,
		Username:            user.Username,
		QuotaUsedBytes:      usageBytes,
		QuotaLimitBytes:     limitBytes,
		QuotaRemainingBytes: remainingBytes,
		ActiveKeysCount:     activeKeysCount,
		TasksCount:          int(tasksCount),
		FailedTasksCount:    int(failedTasksCount),
	}

	if lastKey != nil && lastKey.LastUsedAt != nil {
		resp.LastActivityAt = lastKey.LastUsedAt
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// SystemAnalyticsResponse represents system-wide analytics
type SystemAnalyticsResponse struct {
	TotalUsers           int64       `json:"total_users"`
	ActiveUsers          int64       `json:"active_users"`
	TotalTasksCount      int64       `json:"total_tasks_count"`
	FailedTasksCount     int64       `json:"failed_tasks_count"`
	TotalDownloadedBytes int64       `json:"total_downloaded_bytes"`
	TotalQuotaLimitBytes int64       `json:"total_quota_limit_bytes"`
	TotalQuotaUsedBytes  int64       `json:"total_quota_used_bytes"`
	TopUsers             []UserStats `json:"top_users"`
}

// UserStats represents stats for a user
type UserStats struct {
	UserID          int64  `json:"user_id"`
	Username        string `json:"username"`
	UsedBytes       int64  `json:"used_bytes"`
	TasksCount      int    `json:"tasks_count"`
	LastActivityAt  *time.Time `json:"last_activity_at,omitempty"`
}

// GetSystemAnalytics handles GET /admin/analytics?aggregated=true
func (ah *AdminHandler) GetSystemAnalytics(w http.ResponseWriter, r *http.Request) {
	// Count total users
	var totalUsers int64
	ah.db.Table("users").Where("deleted_at IS NULL").Count(&totalUsers)

	// Count active users (with activity in last 7 days)
	var activeUsers int64
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	ah.db.Table("users u").
		Joins("LEFT JOIN api_keys ak ON u.id = ak.user_id").
		Where("u.deleted_at IS NULL AND ak.last_used_at >= ?", sevenDaysAgo).
		Distinct("u.id").
		Count(&activeUsers)

	// Count tasks
	var totalTasksCount int64
	ah.db.Table("download_sessions").Count(&totalTasksCount)

	// Count failed tasks
	var failedTasksCount int64
	ah.db.Table("download_sessions").Where("status IN ?", []string{"failed", "error"}).Count(&failedTasksCount)

	// Sum quota usage and limits
	var totalQuotaUsedBytes int64
	var totalQuotaLimitBytes int64
	ah.db.Table("quotas").
		Select("COALESCE(SUM(downloaded_bytes_month), 0), COALESCE(SUM(quota_limit_bytes), 0)").
		Row().
		Scan(&totalQuotaUsedBytes, &totalQuotaLimitBytes)

	// Get top users by quota usage (top 5)
	var topUsers []struct {
		UserID    int64
		Username  string
		UsedBytes int64
	}

	ah.db.Table("quotas q").
		Select("u.id, u.username, COALESCE(q.downloaded_bytes_month, 0) as used_bytes").
		Joins("LEFT JOIN users u ON q.user_id = u.id").
		Where("u.deleted_at IS NULL").
		Group("u.id, u.username, q.downloaded_bytes_month").
		Order("used_bytes DESC").
		Limit(5).
		Scan(&topUsers)

	topUsersResp := make([]UserStats, 0)
	for _, u := range topUsers {
		topUsersResp = append(topUsersResp, UserStats{
			UserID:    u.UserID,
			Username:  u.Username,
			UsedBytes: u.UsedBytes,
		})
	}

	resp := SystemAnalyticsResponse{
		TotalUsers:           totalUsers,
		ActiveUsers:          activeUsers,
		TotalTasksCount:      totalTasksCount,
		FailedTasksCount:     failedTasksCount,
		TotalDownloadedBytes: totalQuotaUsedBytes,
		TotalQuotaLimitBytes: totalQuotaLimitBytes,
		TotalQuotaUsedBytes:  totalQuotaUsedBytes,
		TopUsers:             topUsersResp,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// DeleteUserResponse represents user deletion response
type DeleteUserResponse struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Message  string `json:"message"`
}

// DeleteUser handles DELETE /admin/users/{user_id}
func (ah *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Get user to verify exists
	user, err := ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Soft delete user (cascade deletes will remove keys and tasks)
	if err := ah.userManager.DeactivateUser(userID); err != nil {
		ah.logger.Error("failed to delete user",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(DeleteUserResponse{
		UserID:   userID,
		Username: user.Username,
		Message:  "user deleted successfully",
	})

	ah.logger.Info("admin deleted user",
		zap.Int64("user_id", userID),
		zap.String("username", user.Username),
	)
}

// BillingResponse represents billing info for a user
type BillingResponse struct {
	UserID              int64  `json:"user_id"`
	CurrentCredits      int64  `json:"current_credits"`
	LifetimeConsumed    int64  `json:"lifetime_consumed"`
	LifetimePurchased   int64  `json:"lifetime_purchased"`
}

// GetBilling handles GET /admin/billing/{user_id}
func (ah *AdminHandler) GetBilling(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Check if user exists
	_, err = ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Get current credit balance
	currentCredits, err := ah.billingManager.GetBalance(r.Context(), userID)
	if err != nil {
		ah.logger.Error("failed to get credit balance",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to get credit balance")
		return
	}

	// Get lifetime consumption and purchases
	var lifetimeConsumed int64
	var lifetimePurchased int64

	ah.db.Table("credit_transactions").
		Where("user_id = ? AND type = ?", userID, string(db.TransactionTypeUsage)).
		Select("COALESCE(SUM(amount), 0)").
		Row().
		Scan(&lifetimeConsumed)

	ah.db.Table("credit_transactions").
		Where("user_id = ? AND type = ?", userID, string(db.TransactionTypePurchase)).
		Select("COALESCE(SUM(amount), 0)").
		Row().
		Scan(&lifetimePurchased)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(BillingResponse{
		UserID:            userID,
		CurrentCredits:    currentCredits,
		LifetimeConsumed:  lifetimeConsumed,
		LifetimePurchased: lifetimePurchased,
	})

	ah.logger.Info("admin fetched billing info",
		zap.Int64("user_id", userID),
	)
}

// TransactionResponse represents a single transaction
type TransactionResponse struct {
	ID        int64     `json:"id"`
	Type      string    `json:"type"`
	Amount    int64     `json:"amount"`
	TaskID    string    `json:"task_id,omitempty"`
	Reason    string    `json:"reason,omitempty"`
	AdminID   int64     `json:"admin_id,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// BillingTransactionsResponse represents paginated transaction history
type BillingTransactionsResponse struct {
	Transactions []TransactionResponse `json:"transactions"`
	Total        int64                 `json:"total"`
	Limit        int                   `json:"limit"`
	Offset       int                   `json:"offset"`
}

// GetBillingTransactions handles GET /admin/billing/{user_id}/transactions
func (ah *AdminHandler) GetBillingTransactions(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Check if user exists
	_, err = ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Parse pagination parameters
	limit := 10
	offset := 0

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	// Get transaction history
	transactions, err := ah.billingManager.GetTransactionHistory(r.Context(), userID, limit, offset)
	if err != nil {
		ah.logger.Error("failed to get transaction history",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to get transaction history")
		return
	}

	// Convert to response format
	respTransactions := make([]TransactionResponse, len(transactions))
	for i, txn := range transactions {
		respTransactions[i] = TransactionResponse{
			ID:        txn.ID,
			Type:      txn.Type,
			Amount:    txn.Amount,
			TaskID:    txn.TaskID,
			Reason:    txn.Reason,
			AdminID:   txn.AdminID,
			Timestamp: txn.CreatedAt,
		}
	}

	// Get total count
	var totalCount int64
	ah.db.Table("credit_transactions").Where("user_id = ?", userID).Count(&totalCount)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(BillingTransactionsResponse{
		Transactions: respTransactions,
		Total:        totalCount,
		Limit:        limit,
		Offset:       offset,
	})

	ah.logger.Info("admin fetched billing transactions",
		zap.Int64("user_id", userID),
		zap.Int("limit", limit),
		zap.Int("offset", offset),
	)
}

// AddCreditsRequest represents request to add credits
type AddCreditsRequest struct {
	Amount int64  `json:"amount"`
	Reason string `json:"reason"`
}

// AddCreditsResponse represents response after adding credits
type AddCreditsResponse struct {
	UserID        int64  `json:"user_id"`
	NewBalance    int64  `json:"new_balance"`
	TransactionID int64  `json:"transaction_id"`
	AddedAmount   int64  `json:"added_amount"`
}

// AddCredits handles POST /admin/billing/{user_id}/add-credits
func (ah *AdminHandler) AddCredits(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.PathValue("user_id")
	if userIDStr == "" {
		writeError(w, http.StatusBadRequest, "user_id required")
		return
	}

	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	// Check if user exists
	_, err = ah.userManager.GetUser(userID)
	if err != nil {
		ah.logger.Warn("user not found",
			zap.Int64("user_id", userID),
		)
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Parse request
	var req AddCreditsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate amount
	if req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}

	if req.Reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return
	}

	// Use admin ID 0 for now (no admin user model yet)
	// In future, extract admin identity from auth token
	adminID := int64(0)

	// Adjust credits via billing manager
	err = ah.billingManager.AdminAdjustCredits(r.Context(), userID, adminID, req.Amount, req.Reason)
	if err != nil {
		ah.logger.Error("failed to add credits",
			zap.Int64("user_id", userID),
			zap.Int64("amount", req.Amount),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to add credits")
		return
	}

	// Get new balance
	newBalance, err := ah.billingManager.GetBalance(r.Context(), userID)
	if err != nil {
		ah.logger.Error("failed to get new balance",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		newBalance = 0
	}

	// Get the created transaction ID (fetch last transaction for this user)
	var txn db.CreditTransaction
	ah.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(1).
		First(&txn)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(AddCreditsResponse{
		UserID:        userID,
		NewBalance:    newBalance,
		TransactionID: txn.ID,
		AddedAmount:   req.Amount,
	})

	ah.logger.Info("admin added credits",
		zap.Int64("user_id", userID),
		zap.Int64("amount", req.Amount),
		zap.String("reason", req.Reason),
	)
}

// AggregatedBillingResponse represents system-wide billing statistics
type AggregatedBillingResponse struct {
	TotalUsers           int64 `json:"total_users"`
	TotalCreditsDistributed int64 `json:"total_credits_distributed"`
	TotalCreditsConsumed int64 `json:"total_credits_consumed"`
	ActiveBillingUsers   int64 `json:"active_billing_users"`
}

// GetAggregatedBilling handles GET /admin/billing?aggregated=true
func (ah *AdminHandler) GetAggregatedBilling(w http.ResponseWriter, r *http.Request) {
	// Count total users
	var totalUsers int64
	ah.db.Table("users").Where("deleted_at IS NULL").Count(&totalUsers)

	// Get total credits distributed (sum of all purchase transactions)
	var totalDistributed int64
	ah.db.Table("credit_transactions").
		Where("type = ?", string(db.TransactionTypePurchase)).
		Select("COALESCE(SUM(amount), 0)").
		Row().
		Scan(&totalDistributed)

	// Get total credits consumed (sum of all usage transactions)
	var totalConsumed int64
	ah.db.Table("credit_transactions").
		Where("type = ?", string(db.TransactionTypeUsage)).
		Select("COALESCE(SUM(amount), 0)").
		Row().
		Scan(&totalConsumed)

	// Count users with any credit activity
	var activeBillingUsers int64
	ah.db.Table("credits").Where("balance > 0 OR balance < 0").Count(&activeBillingUsers)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(AggregatedBillingResponse{
		TotalUsers:              totalUsers,
		TotalCreditsDistributed: totalDistributed,
		TotalCreditsConsumed:    totalConsumed,
		ActiveBillingUsers:      activeBillingUsers,
	})

	ah.logger.Info("admin fetched aggregated billing stats")
}

// BillingConfigRequest represents request to update billing config
type BillingConfigRequest struct {
	CreditsPerGB float64 `json:"credits_per_gb"`
}

// BillingConfigResponse represents billing configuration
type BillingConfigResponse struct {
	CreditsPerGB float64   `json:"credits_per_gb"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UpdateBillingConfig handles POST /admin/billing/config
func (ah *AdminHandler) UpdateBillingConfig(w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req BillingConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate credits per GB
	if req.CreditsPerGB <= 0 {
		writeError(w, http.StatusBadRequest, "credits_per_gb must be positive")
		return
	}

	// Update or create billing config
	// For now, we assume single row with ID=1
	config := &db.BillingConfig{
		ID:           1,
		CreditsPerGB: req.CreditsPerGB,
		UpdatedAt:    time.Now(),
	}

	// Upsert: update if exists, otherwise create
	if err := ah.db.Model(&db.BillingConfig{}).
		Where("id = ?", 1).
		Assign(config).
		FirstOrCreate(config).Error; err != nil {
		ah.logger.Error("failed to update billing config",
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to update billing config")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(BillingConfigResponse{
		CreditsPerGB: config.CreditsPerGB,
		UpdatedAt:    config.UpdatedAt,
	})

	ah.logger.Info("admin updated billing config",
		zap.Float64("credits_per_gb", req.CreditsPerGB),
	)
}

// QuickSetupKey handles POST /setup/quick-key (public endpoint for first-time setup)
func (ah *AdminHandler) QuickSetupKey(w http.ResponseWriter, r *http.Request) {
	// Check if default user already exists
	var user db.User
	result := ah.db.Where("username = ?", "default").First(&user)

	// If user doesn't exist, create one
	if result.Error == gorm.ErrRecordNotFound {
		user = db.User{
			Username: "default",
			IsActive: true,
		}
		if err := ah.db.Create(&user).Error; err != nil {
			ah.logger.Error("failed to create default user",
				zap.Error(err),
			)
			writeError(w, http.StatusInternalServerError, "failed to create user")
			return
		}

		// Initialize credit account with free trial
		credit := &db.Credit{
			UserID: user.ID,
			Balance: 100, // 100GB free trial
		}
		ah.db.Create(credit)
	}

	// Generate API key for user
	key, err := ah.keyManager.CreateKey(user.ID, "web-setup")
	if err != nil {
		ah.logger.Error("failed to generate API key",
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to generate API key")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"api_key":  key,
		"user_id":  user.ID,
		"username": user.Username,
	})

	ah.logger.Info("quick setup key generated",
		zap.Int64("user_id", user.ID),
	)
}

// GetSetupStatus handles GET /setup/status (public endpoint to check setup status)
func (ah *AdminHandler) GetSetupStatus(w http.ResponseWriter, r *http.Request) {
	// Check if default user exists
	var user db.User
	result := ah.db.Where("username = ?", "default").First(&user)

	setupDone := result.Error == nil

	// Count API keys
	var keyCount int64
	if setupDone {
		ah.db.Model(&db.APIKey{}).Where("user_id = ? AND is_revoked = ?", user.ID, false).Count(&keyCount)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"setup_complete": setupDone,
		"user_id":        user.ID,
		"has_api_keys":   keyCount > 0,
		"message":        getSetupMessage(setupDone),
	})
}

func getSetupMessage(setupDone bool) string {
	if setupDone {
		return "Setup complete. API key is ready."
	}
	return "Setup not complete. Call POST /setup/quick-key to generate your first API key."
}
