package api

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redis/go-redis/v9"

	"github.com/redredchen01/tgdownloader-v2/internal/metrics"
)

// DashboardHandler handles dashboard-related HTTP endpoints
type DashboardHandler struct {
	db         *gorm.DB
	redis      *redis.Client
	logger     *zap.Logger
	collector  *metrics.Collector
	whitelist  []*net.IPNet
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(
	dbConn *gorm.DB,
	redisClient *redis.Client,
	logger *zap.Logger,
) *DashboardHandler {
	collector := metrics.NewCollector(dbConn, redisClient, logger)

	// Parse IP whitelist from environment (default: 127.0.0.1)
	whitelistStr := os.Getenv("DASHBOARD_IP_WHITELIST")
	if whitelistStr == "" {
		whitelistStr = "127.0.0.1/32"
	}

	whitelist := parseWhitelist(whitelistStr, logger)

	return &DashboardHandler{
		db:        dbConn,
		redis:     redisClient,
		logger:    logger,
		collector: collector,
		whitelist: whitelist,
	}
}

// ipWhitelistMiddleware checks if request IP is in whitelist
func (dh *DashboardHandler) ipWhitelistMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientIP := getClientIP(r)
		if !dh.isIPWhitelisted(clientIP) {
			dh.logger.Warn("unauthorized dashboard access",
				zap.String("ip", clientIP),
				zap.String("path", r.URL.Path),
			)
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// isIPWhitelisted checks if an IP is in the whitelist
func (dh *DashboardHandler) isIPWhitelisted(ipStr string) bool {
	// Parse IP, removing port if present
	ip := net.ParseIP(ipStr)
	if ip == nil {
		// Try to parse as IP:port
		ipStr = strings.Split(ipStr, ":")[0]
		ip = net.ParseIP(ipStr)
	}

	if ip == nil {
		return false
	}

	for _, cidr := range dh.whitelist {
		if cidr.Contains(ip) {
			return true
		}
	}

	return false
}

// GetMetrics handles GET /metrics
func (dh *DashboardHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	// Check IP whitelist
	clientIP := getClientIP(r)
	if !dh.isIPWhitelisted(clientIP) {
		dh.logger.Warn("unauthorized metrics access", zap.String("ip", clientIP))
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	m, err := dh.collector.Collect(r.Context())
	if err != nil {
		dh.logger.Error("failed to collect metrics", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "failed to collect metrics")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(m)
}

// GetErrors handles GET /metrics/errors
func (dh *DashboardHandler) GetErrors(w http.ResponseWriter, r *http.Request) {
	// Check IP whitelist
	clientIP := getClientIP(r)
	if !dh.isIPWhitelisted(clientIP) {
		dh.logger.Warn("unauthorized errors access", zap.String("ip", clientIP))
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	errors, err := dh.collector.GetErrors(r.Context(), 20)
	if err != nil {
		dh.logger.Error("failed to get errors", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "failed to get errors")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(errors)
}

// ServeWithMiddleware returns the handler with IP whitelist middleware applied
func (dh *DashboardHandler) ServeWithMiddleware(pattern string, handler http.HandlerFunc) {
	// Already checked in GetMetrics and GetErrors, so middleware not needed here
}

// getClientIP extracts client IP from request
// Checks X-Forwarded-For header first (for proxied requests), then RemoteAddr
func getClientIP(r *http.Request) string {
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		// Take first IP in chain
		ips := strings.Split(forwarded, ",")
		return strings.TrimSpace(ips[0])
	}

	// Get from RemoteAddr (IP:port format)
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}

// parseWhitelist parses comma-separated CIDR blocks into []*net.IPNet
func parseWhitelist(whitelistStr string, logger *zap.Logger) []*net.IPNet {
	var whitelist []*net.IPNet
	parts := strings.Split(whitelistStr, ",")

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		// Try parsing as CIDR
		_, cidr, err := net.ParseCIDR(part)
		if err == nil {
			whitelist = append(whitelist, cidr)
			continue
		}

		// Try parsing as single IP (convert to /32 CIDR)
		ip := net.ParseIP(part)
		if ip != nil {
			if ip.To4() != nil {
				_, cidr, _ := net.ParseCIDR(part + "/32")
				whitelist = append(whitelist, cidr)
			} else {
				_, cidr, _ := net.ParseCIDR(part + "/128")
				whitelist = append(whitelist, cidr)
			}
			continue
		}

		logger.Warn("failed to parse whitelist entry", zap.String("entry", part))
	}

	return whitelist
}
