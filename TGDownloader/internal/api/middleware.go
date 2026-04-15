package api

import (
	"context"
	"net/http"
	"strings"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/quota"
)

// ContextKey is a custom type for context values to avoid collisions
type ContextKey string

const (
	// UserIDKey is the context key for storing user ID
	UserIDKey ContextKey = "user_id"
)

// AuthMiddleware validates API keys from Authorization header
// Returns 401 for auth failures, 400 for malformed requests
func AuthMiddleware(db *gorm.DB, logger *zap.Logger) func(http.Handler) http.Handler {
	keyManager := auth.NewKeyManager(db)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")

			// Missing header
			if authHeader == "" {
				logger.Warn("missing authorization header", zap.String("path", r.URL.Path))
				writeError(w, http.StatusBadRequest, "missing authorization header")
				return
			}

			// Parse Bearer token format
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				logger.Warn("invalid authorization format", zap.String("path", r.URL.Path))
				writeError(w, http.StatusBadRequest, "invalid authorization format")
				return
			}

			token := parts[1]

			// Empty token
			if token == "" {
				logger.Warn("empty bearer token", zap.String("path", r.URL.Path))
				writeError(w, http.StatusBadRequest, "empty bearer token")
				return
			}

			// Validate key and get user ID
			userID, err := keyManager.ValidateKey(token)
			if err != nil {
				// Log only first 8 chars for debugging
				tokenPreview := token
				if len(tokenPreview) > 8 {
					tokenPreview = tokenPreview[:8] + "..."
				}
				logger.Warn("invalid api key",
					zap.String("token_preview", tokenPreview),
					zap.String("path", r.URL.Path),
					zap.Error(err),
				)
				writeError(w, http.StatusUnauthorized, "invalid or revoked api key")
				return
			}

			// Attach user ID to request context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// WithUserContext is a helper to extract user ID from context
func WithUserContext(r *http.Request) (int64, bool) {
	userID, ok := r.Context().Value(UserIDKey).(int64)
	return userID, ok
}

// QuotaCheckMiddleware checks if user has available quota before processing request
// Returns 507 Insufficient Storage if quota exceeded
// Must be called after AuthMiddleware to ensure user_id is in context
func QuotaCheckMiddleware(db *gorm.DB, logger *zap.Logger) func(http.Handler) http.Handler {
	qm := quota.NewManager(db, logger)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := WithUserContext(r)
			if !ok {
				logger.Error("user_id not found in context for quota check", zap.String("path", r.URL.Path))
				writeError(w, http.StatusInternalServerError, "user context missing")
				return
			}

			// For now, we check with a conservative estimate of max download size
			// In production, this could be parameterized based on request content
			// Allow requests with small estimated sizes; we'll validate actual size during processing
			const estimatedDownloadSize = 100 * 1024 * 1024 // 100 MB conservative estimate

			if !qm.CheckQuota(r.Context(), userID, estimatedDownloadSize) {
				logger.Warn("quota check failed", zap.Int64("user_id", userID))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInsufficientStorage) // 507
				w.Write([]byte(`{"error":"storage quota exceeded"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CreditCheckMiddleware checks if user has available credits before processing request
// Returns 507 Insufficient Storage if credits insufficient (using HTTP 507 like quota)
// Must be called after AuthMiddleware to ensure user_id is in context
// Checks with conservative estimate (100 MB) before queueing task
func CreditCheckMiddleware(db *gorm.DB, logger *zap.Logger) func(http.Handler) http.Handler {
	bm := billing.NewManager(db, logger)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := WithUserContext(r)
			if !ok {
				logger.Error("user_id not found in context for credit check", zap.String("path", r.URL.Path))
				writeError(w, http.StatusInternalServerError, "user context missing")
				return
			}

			// Conservative estimate: 100 MB = 0.1 GB credit requirement
			const estimatedDownloadGB int64 = 1 // Conservative: assume at least 1 GB

			canProceed, _, err := bm.CheckCredits(r.Context(), userID, estimatedDownloadGB)
			if err != nil {
				logger.Warn("credit check failed",
					zap.Int64("user_id", userID),
					zap.Error(err),
				)
				// On error, allow graceful degradation (like quota check)
				next.ServeHTTP(w, r)
				return
			}

			if !canProceed {
				logger.Warn("insufficient credits", zap.Int64("user_id", userID))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInsufficientStorage) // 507
				w.Write([]byte(`{"error":"insufficient credits for this operation"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// AdminAuthMiddleware validates admin token from Authorization header
// Returns 403 Forbidden if not admin
// Note: This is exported from admin_handler.go and re-exported here for convenience
// Actual implementation is in admin_handler.go
