package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// RateLimitHeaders represents RFC 6648 rate limit headers
// https://tools.ietf.org/html/draft-potet-ratelimit-headers-06
type RateLimitHeaders struct {
	Limit     int   // RateLimit-Limit: total requests allowed per minute
	Remaining int   // RateLimit-Remaining: requests remaining in current window
	Reset     int64 // RateLimit-Reset: Unix timestamp when limit resets
}

// NewRateLimitHeaders creates RFC 6648 rate limit headers from rate limit state
func NewRateLimitHeaders(rateLimit *db.RateLimit) *RateLimitHeaders {
	remaining := rateLimit.RequestLimit - rateLimit.RequestsThisMin
	if remaining < 0 {
		remaining = 0
	}

	return &RateLimitHeaders{
		Limit:     rateLimit.RequestLimit,
		Remaining: remaining,
		Reset:     rateLimit.LastResetTime.Add(time.Minute).Unix(),
	}
}

// ApplyToResponseHeader writes RFC 6648 headers to HTTP response
func (h *RateLimitHeaders) ApplyToResponseHeader(w http.ResponseWriter) {
	w.Header().Set("RateLimit-Limit", strconv.Itoa(h.Limit))
	w.Header().Set("RateLimit-Remaining", strconv.Itoa(h.Remaining))
	w.Header().Set("RateLimit-Reset", strconv.FormatInt(h.Reset, 10))
}

// ApplyToResponseHeaderForLimit writes RFC 6648 headers based on limit configuration
// Used when rate limit check fails to provide headers even on 429 response
func ApplyToResponseHeaderForLimit(w http.ResponseWriter, limit int, remaining int, resetTime time.Time) {
	w.Header().Set("RateLimit-Limit", strconv.Itoa(limit))
	w.Header().Set("RateLimit-Remaining", strconv.Itoa(remaining))
	w.Header().Set("RateLimit-Reset", strconv.FormatInt(resetTime.Unix(), 10))
}
