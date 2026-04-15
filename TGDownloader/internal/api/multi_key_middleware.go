package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// ContextKey constants for multi-key auth
const (
	KeyIDKey    ContextKey = "key_id"
	KeyTypeKey  ContextKey = "key_type"
	KeyLimitKey ContextKey = "key_limit" // per-key rate limit value
)

// MultiKeyAuthMiddleware validates API keys and enforces key-type-specific rate limits
// Returns 401 for auth failures, 403 for key-type access violations, 400 for malformed requests
func MultiKeyAuthMiddleware(dbConn *gorm.DB, logger *zap.Logger) func(http.Handler) http.Handler {
	keyManager := auth.NewKeyManager(dbConn)
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
			if token == "" {
				logger.Warn("empty bearer token", zap.String("path", r.URL.Path))
				writeError(w, http.StatusBadRequest, "empty bearer token")
				return
			}

			// Validate key and get details
			userID, keyID, keyType, err := keyManager.ValidateKeyWithType(token)
			if err != nil {
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

			// Enforce endpoint-specific access control based on key type
			if !isEndpointAllowedForKeyType(r.URL.Path, keyType) {
				logger.Warn("endpoint not allowed for key type",
					zap.Int64("user_id", userID),
					zap.Int64("key_id", keyID),
					zap.String("key_type", string(keyType)),
					zap.String("path", r.URL.Path),
				)
				writeError(w, http.StatusForbidden, "this key type is not permitted for this endpoint")
				return
			}

			// Set rate limit based on key type
			keyLimit := getRateLimitForKeyType(keyType)

			// Attach auth details to context
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			ctx = context.WithValue(ctx, KeyIDKey, keyID)
			ctx = context.WithValue(ctx, KeyTypeKey, keyType)
			ctx = context.WithValue(ctx, KeyLimitKey, keyLimit)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// WithKeyContext extracts multi-key auth details from context
func WithKeyContext(r *http.Request) (userID, keyID int64, keyType db.KeyType, keyLimit int, ok bool) {
	userID, ok = r.Context().Value(UserIDKey).(int64)
	if !ok {
		return
	}
	keyID, ok = r.Context().Value(KeyIDKey).(int64)
	if !ok {
		return
	}
	keyType, ok = r.Context().Value(KeyTypeKey).(db.KeyType)
	if !ok {
		return
	}
	keyLimit, ok = r.Context().Value(KeyLimitKey).(int)
	return
}

// isEndpointAllowedForKeyType checks if endpoint is allowed for the given key type
func isEndpointAllowedForKeyType(path string, keyType db.KeyType) bool {
	switch keyType {
	case db.KeyTypeAPI:
		// API keys allowed on /api/v1/* endpoints only
		return strings.HasPrefix(path, "/api/v1/")
	case db.KeyTypeWebhook:
		// Webhook keys allowed on /webhook/* endpoints only
		return strings.HasPrefix(path, "/webhook/")
	default:
		return false
	}
}

// getRateLimitForKeyType returns the request limit per minute for the key type
func getRateLimitForKeyType(keyType db.KeyType) int {
	switch keyType {
	case db.KeyTypeAPI:
		return 100 // 100 requests per minute for API keys
	case db.KeyTypeWebhook:
		return 1000 // 1000 requests per minute for webhook keys
	default:
		return 100 // Conservative default
	}
}

// MultiKeyRateLimitMiddleware enforces per-key rate limiting with independent buckets
// API keys: 100 req/min, webhook keys: 1000 req/min
// Must be called after MultiKeyAuthMiddleware
// Attaches RFC 6648 rate limit headers to all responses (including 429)
func MultiKeyRateLimitMiddleware(dbConn *gorm.DB, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, keyID, keyType, keyLimit, ok := WithKeyContext(r)
			if !ok {
				logger.Error("key context missing for rate limit check", zap.String("path", r.URL.Path))
				writeError(w, http.StatusInternalServerError, "key context missing")
				return
			}

			// Get or create per-key rate limit bucket
			var rateLimit db.RateLimit
			now := time.Now()
			oneMinuteAgo := now.Add(-1 * time.Minute)

			// Query by key_id for per-key buckets
			result := dbConn.Where("key_id = ? AND last_reset_time > ?", keyID, oneMinuteAgo).
				First(&rateLimit)

			if result.Error == gorm.ErrRecordNotFound {
				// Create new bucket for this minute
				rateLimit = db.RateLimit{
					UserID:          userID,
					KeyID:           &keyID,
					RequestsThisMin: 1,
					RequestLimit:    keyLimit,
					LastResetTime:   now,
				}
				if err := dbConn.Create(&rateLimit).Error; err != nil {
					logger.Error("failed to create rate limit bucket",
						zap.Int64("user_id", userID),
						zap.Int64("key_id", keyID),
						zap.Error(err),
					)
					// Apply headers even on error
					ApplyToResponseHeaderForLimit(w, keyLimit, 0, now.Add(time.Minute))
					writeError(w, http.StatusServiceUnavailable, "rate limit check failed")
					return
				}
				// Attach RFC 6648 headers for newly created bucket
				headers := NewRateLimitHeaders(&rateLimit)
				headers.ApplyToResponseHeader(w)
				// Store in context for downstream handlers to access if needed
				ctx := context.WithValue(r.Context(), "rateLimit", headers)
				r = r.WithContext(ctx)
			} else if result.Error != nil {
				logger.Error("failed to fetch rate limit bucket",
					zap.Int64("user_id", userID),
					zap.Int64("key_id", keyID),
					zap.Error(result.Error),
				)
				// Apply headers even on error
				ApplyToResponseHeaderForLimit(w, keyLimit, 0, now.Add(time.Minute))
				writeError(w, http.StatusServiceUnavailable, "rate limit check failed")
				return
			} else {
				// Bucket exists and is current; check limit
				if rateLimit.RequestsThisMin >= rateLimit.RequestLimit {
					logger.Warn("rate limit exceeded for key",
						zap.Int64("user_id", userID),
						zap.Int64("key_id", keyID),
						zap.String("key_type", string(keyType)),
						zap.Int("requests", rateLimit.RequestsThisMin),
						zap.Int("limit", rateLimit.RequestLimit),
					)
					// Apply headers showing remaining = 0
					ApplyToResponseHeaderForLimit(w, rateLimit.RequestLimit, 0, rateLimit.LastResetTime.Add(time.Minute))
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusTooManyRequests) // 429
					w.Write([]byte(`{"error":"rate limit exceeded"}`))
					return
				}

				// Increment counter
				if err := dbConn.Model(&rateLimit).Update("requests_this_min", rateLimit.RequestsThisMin+1).Error; err != nil {
					logger.Error("failed to increment rate limit counter",
						zap.Int64("user_id", userID),
						zap.Int64("key_id", keyID),
						zap.Error(err),
					)
					ApplyToResponseHeaderForLimit(w, keyLimit, 0, rateLimit.LastResetTime.Add(time.Minute))
					writeError(w, http.StatusServiceUnavailable, "rate limit check failed")
					return
				}

				// Attach RFC 6648 headers to response
				// Reload rate limit from DB to get the updated RequestsThisMin value
				var updatedRateLimit db.RateLimit
				if err := dbConn.Where("id = ?", rateLimit.ID).First(&updatedRateLimit).Error; err != nil {
					logger.Error("failed to reload rate limit for headers",
						zap.Int64("user_id", userID),
						zap.Int64("key_id", keyID),
						zap.Error(err),
					)
					// Still apply headers even if reload failed
					ApplyToResponseHeaderForLimit(w, keyLimit, 0, rateLimit.LastResetTime.Add(time.Minute))
				} else {
					headers := NewRateLimitHeaders(&updatedRateLimit)
					headers.ApplyToResponseHeader(w)
					// Store in context for downstream handlers to access if needed
					ctx := context.WithValue(r.Context(), "rateLimit", headers)
					r = r.WithContext(ctx)
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}
