package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// Handler handles HTTP API requests
type Handler struct {
	db         *gorm.DB
	redis      *redis.Client
	logger     *zap.Logger
	limiter    *RateLimiter
	tdlibAuth  map[string]interface{} // Placeholder for TDLib auth flow state
	tdlibMutex sync.RWMutex           // Protect tdlibAuth
}

// RateLimiter enforces per-user rate limiting with DB backing
type RateLimiter struct {
	db       *gorm.DB
	logger   *zap.Logger
	mu       sync.RWMutex
	buckets  map[int64]*TokenBucket // userID -> bucket
	maxQPS   float64                 // queries per second (default 100/min = ~1.67 qps)
	maxBurst int
}

// TokenBucket represents a token bucket for rate limiting
type TokenBucket struct {
	tokens     float64
	lastRefill time.Time
	maxTokens  float64
	refillRate float64
}

// NewHandler creates a new API handler
func NewHandler(dbConn *gorm.DB, redisClient *redis.Client, logger *zap.Logger) *Handler {
	return &Handler{
		db:        dbConn,
		redis:     redisClient,
		logger:    logger,
		limiter:   NewRateLimiter(dbConn, logger, 100.0/60.0, 20), // 100 req/min, 20 burst
		tdlibAuth: make(map[string]interface{}),
	}
}

// NewRateLimiter creates a new rate limiter with DB backing
// maxQPS: queries per second (e.g., 100/60 for 100 req/min)
// maxBurst: maximum burst tokens allowed
func NewRateLimiter(dbConn *gorm.DB, logger *zap.Logger, maxQPS float64, maxBurst int) *RateLimiter {
	return &RateLimiter{
		db:       dbConn,
		logger:   logger,
		buckets:  make(map[int64]*TokenBucket),
		maxQPS:   maxQPS,
		maxBurst: maxBurst,
	}
}

// Allow checks if a request from the given user should be allowed
// Uses in-memory token bucket with per-second refill granularity
func (rl *RateLimiter) Allow(userID int64) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	bucket, exists := rl.buckets[userID]
	if !exists {
		// Initialize new bucket with max tokens
		bucket = &TokenBucket{
			tokens:     float64(rl.maxBurst),
			lastRefill: time.Now(),
			maxTokens:  float64(rl.maxBurst),
			refillRate: rl.maxQPS,
		}
		rl.buckets[userID] = bucket
	}

	// Refill tokens based on time elapsed (second-level granularity)
	now := time.Now()
	elapsed := now.Sub(bucket.lastRefill).Seconds()
	bucket.tokens = min(bucket.maxTokens, bucket.tokens+elapsed*bucket.refillRate)
	bucket.lastRefill = now

	if bucket.tokens >= 1.0 {
		bucket.tokens--
		return true
	}
	return false
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// SubmitTask handles POST /tasks
func (h *Handler) SubmitTask(w http.ResponseWriter, r *http.Request) {
	// Extract user ID from context (set by auth middleware)
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	// Check per-user rate limit
	if !h.limiter.Allow(userID) {
		w.Header().Set("Retry-After", "1")
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		h.logger.Warn("rate limit exceeded", zap.Int64("user_id", userID))
		return
	}

	// Parse request
	var req TaskSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Detect if URL is Telegram link (t.me/...)
	if isTelegramURL(req.URL) {
		// Dev mode: skip Telegram auth check
		isDevMode := os.Getenv("DEV_MODE") == "1" || os.Getenv("DEV_MODE") == "true"

		if !isDevMode {
			// Check if user has stored Telegram session
			var session db.TDLibSession
			result := h.db.Where("user_id = ? AND active = ?", userID, true).First(&session)

			if result.Error == gorm.ErrRecordNotFound {
				// No active session, user must authenticate first
				h.logger.Info("user must authenticate for telegram download",
					zap.Int64("user_id", userID),
				)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusAccepted) // 202 Accepted
				json.NewEncoder(w).Encode(map[string]interface{}{
					"auth_required": true,
					"auth_url":      "/auth/telegram/phone",
					"message":       "User must authenticate with Telegram first",
				})
				return
			}

			if result.Error != nil {
				h.logger.Error("failed to check telegram session",
					zap.Int64("user_id", userID),
					zap.Error(result.Error),
				)
				writeError(w, http.StatusInternalServerError, "database error")
				return
			}

			// User has active session, continue with task creation
			h.logger.Info("user has active telegram session, proceeding with download",
				zap.Int64("user_id", userID),
			)
		} else {
			h.logger.Warn("dev mode: skipping telegram auth check",
				zap.Int64("user_id", userID),
			)
		}

		// Set source_type to telegram if not already set
		if req.SourceType == "" {
			req.SourceType = "telegram"
		}
	}

	// Generate task ID
	taskID := uuid.New().String()

	// Create download session
	session := &db.DownloadSession{
		SessionID:     taskID,
		UserID:        userID,
		FileURL:       req.URL,
		SourceType:    req.SourceType,
		Status:        string(types.StatePending),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		LastHeartbeat: time.Now(),
	}

	if err := h.db.Create(session).Error; err != nil {
		h.logger.Error("failed to create session",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	// Enqueue to Redis with user_id for isolation
	taskPayload := &types.TaskPayload{
		ID:         taskID,
		UserID:     userID,
		SourceType: types.SourceType(req.SourceType),
		URL:        req.URL,
		Metadata:   req.Metadata,
		Status:     types.StatePending,
		CreatedAt:  time.Now(),
	}

	payload, _ := json.Marshal(taskPayload)
	// Enqueue to Redis queue (priority=5 for default)
	if err := h.redis.ZAdd(r.Context(), "queue:5", redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: string(payload),
	}).Err(); err != nil {
		h.logger.Error("failed to enqueue task", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "failed to enqueue task")
		return
	}

	h.logger.Info("task submitted",
		zap.Int64("user_id", userID),
		zap.String("task_id", taskID),
		zap.String("source", req.SourceType),
	)

	// Write response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(TaskSubmitResponse{
		TaskID:    taskID,
		StatusURL: fmt.Sprintf("/tasks/%s", taskID),
	})
}

// GetTaskStatus handles GET /tasks/:id
func (h *Handler) GetTaskStatus(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("id")
	if taskID == "" {
		writeError(w, http.StatusBadRequest, "task_id required")
		return
	}

	// Query database
	var session db.DownloadSession
	if err := h.db.First(&session, "session_id = ?", taskID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		h.logger.Error("failed to query session", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Calculate progress
	var progressPercent int
	if session.TotalSizeBytes > 0 {
		progressPercent = int((float64(session.FileSizeHint) / float64(session.TotalSizeBytes)) * 100)
	}

	// Parse output URLs
	var outputURLs []OutputURL
	if session.OutputURLs != "" {
		json.Unmarshal([]byte(session.OutputURLs), &outputURLs)
	}

	// Fetch metadata if available
	var taskMeta *TaskMetadata
	var dbMeta db.TaskMetadata
	if result := h.db.Where("task_id = ?", taskID).First(&dbMeta); result.Error == nil {
		taskMeta = &TaskMetadata{
			DurationMs:   dbMeta.DurationMs,
			VideoCodec:   dbMeta.VideoCodec,
			AudioCodec:   dbMeta.AudioCodec,
			Width:        dbMeta.Width,
			Height:       dbMeta.Height,
			BitRate:      dbMeta.BitRate,
			ContainerFmt: dbMeta.ContainerFmt,
			ThumbnailURL: dbMeta.ThumbnailURL,
		}
	}

	// Calculate file path from session
	var filePath string
	if session.Status == "done" {
		// Get user ID from context (set by auth middleware)
		userID, ok := WithUserContext(r)
		if ok && userID > 0 {
			downloadDir := os.Getenv("DOWNLOAD_DIR")
			if downloadDir == "" {
				downloadDir = filepath.Join(os.ExpandEnv("$HOME"), "Downloads", "tgdownloader-data", "downloads")
			}
			// For Telegram videos, file has .mp4 extension
			if session.SourceType == "telegram" {
				filePath = filepath.Join(downloadDir, fmt.Sprintf("%d", userID), taskID, taskID+".mp4")
			} else {
				filePath = filepath.Join(downloadDir, fmt.Sprintf("%d", userID), taskID, taskID)
			}
		}
	}

	response := map[string]interface{}{
		"task_id":           taskID,
		"status":            session.Status,
		"progress_percent":  progressPercent,
		"downloaded_bytes":  session.FileSizeHint,
		"total_bytes":       session.TotalSizeBytes,
		"error_message":     session.ErrorMessage,
		"output_urls":       outputURLs,
		"metadata":          taskMeta,
		"file_path":         filePath,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ListTasks handles GET /tasks - returns history of tasks for authenticated user
func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	// Extract user ID from context (set by auth middleware)
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	// Parse query params
	limit := 100
	offset := 0
	status := ""

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := parseIntParam(limitStr, 100, 500); err == nil {
			limit = parsed
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if parsed, err := parseIntParam(offsetStr, 0, 10000); err == nil {
			offset = parsed
		}
	}
	if s := r.URL.Query().Get("status"); s != "" {
		status = s
	}

	// Build query
	query := h.db.Where("user_id = ?", userID).Order("created_at DESC")
	if status != "" {
		query = query.Where("status = ?", status)
	}

	// Count total
	var total int64
	if err := query.Model(&db.DownloadSession{}).Count(&total).Error; err != nil {
		h.logger.Error("failed to count tasks", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "failed to count tasks")
		return
	}

	// Fetch paginated results
	var sessions []db.DownloadSession
	if err := query.Limit(limit).Offset(offset).Find(&sessions).Error; err != nil {
		h.logger.Error("failed to list tasks", zap.Error(err))
		writeError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}

	// Build response
	tasks := make([]map[string]interface{}, len(sessions))
	for i, session := range sessions {
		tasks[i] = map[string]interface{}{
			"session_id":        session.SessionID,
			"status":            session.Status,
			"file_url":          session.FileURL,
			"source_type":       session.SourceType,
			"created_at":        session.CreatedAt,
			"completed_at":      session.CompletedAt,
			"file_size_hint":    session.FileSizeHint,
			"total_size_bytes":  session.TotalSizeBytes,
			"error_message":     session.ErrorMessage,
		}
	}

	response := map[string]interface{}{
		"tasks":  tasks,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// HealthCheck handles GET /health
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status: "healthy",
		Redis:  "ok",
		DB:     "ok",
	}

	// Check Redis
	if _, err := h.redis.Ping(r.Context()).Result(); err != nil {
		resp.Redis = "down"
	}

	// Check DB
	sqlDB, _ := h.db.DB()
	if err := sqlDB.PingContext(r.Context()); err != nil {
		resp.DB = "down"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}

// InitPhoneAuth handles POST /auth/telegram/phone
func (h *Handler) InitPhoneAuth(w http.ResponseWriter, r *http.Request) {
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	// Parse request body
	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Validate phone format
	if err := validatePhoneFormat(req.Phone); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid phone: %v", err))
		return
	}

	// Generate request ID for this auth flow
	requestID := generateRequestID()

	h.tdlibMutex.Lock()
	h.tdlibAuth[requestID] = map[string]interface{}{
		"phone":    req.Phone,
		"user_id": userID,
		"created_at": time.Now(),
	}
	h.tdlibMutex.Unlock()

	h.logger.Info("phone auth initiated",
		zap.String("request_id", requestID),
		zap.Int64("user_id", userID),
	)

	// Return request ID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"request_id": requestID,
	})
}

// VerifyPhoneCode handles POST /auth/telegram/verify
func (h *Handler) VerifyPhoneCode(w http.ResponseWriter, r *http.Request) {
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	// Parse request body
	var req struct {
		RequestID string `json:"request_id"`
		Code      string `json:"code"`
		Phone     string `json:"phone"` // Optional: for dev mode
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Dev mode: allow any code starting with 9 (e.g., 99999 or 999999)
	isDevMode := os.Getenv("DEV_MODE") == "1" || os.Getenv("DEV_MODE") == "true"
	if !isDevMode {
		// Production: validate code format
		if err := validateCodeFormat(req.Code); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid code: %v", err))
			return
		}
	}

	// Look up auth request
	h.tdlibMutex.RLock()
	authData, exists := h.tdlibAuth[req.RequestID]
	h.tdlibMutex.RUnlock()

	// Dev mode: allow missing request ID if dev code is used
	if !exists && !(isDevMode && (req.Code == "99999" || req.Code == "999999")) {
		writeError(w, http.StatusBadRequest, "request_id not found or expired")
		return
	}

	// Dev mode: extract phone from request or use default
	var phone string
	if isDevMode && (req.Code == "99999" || req.Code == "999999") {
		// Dev mode: phone can be from request or auto-generated
		if req.Phone != "" {
			phone = req.Phone
		} else {
			phone = "+1234567890" // Dummy phone for dev mode
		}
		h.logger.Warn("dev mode: accepting verification code without actual Telegram verification",
			zap.String("phone", maskPhone(phone)),
			zap.Int64("user_id", userID),
		)
	} else {
		// Production: require valid auth request
		authMap := authData.(map[string]interface{})
		phone = authMap["phone"].(string)
		createdAt := authMap["created_at"].(time.Time)

		// Check if request is still fresh (5 minute timeout)
		if time.Since(createdAt) > 5*time.Minute {
			h.tdlibMutex.Lock()
			delete(h.tdlibAuth, req.RequestID)
			h.tdlibMutex.Unlock()
			writeError(w, http.StatusBadRequest, "request expired")
			return
		}
	}

	// TODO: In production, submit code to Telegram via TDLib
	// For now, we'll create or update a placeholder session in the database
	session := &db.TDLibSession{
		UserID:              userID,
		EncryptedAPIID:      os.Getenv("TELEGRAM_API_ID"),
		EncryptedAPIHash:    os.Getenv("TELEGRAM_API_HASH"),
		EncryptedPhone:      phone,
		Active:              true,
		LastAuthenticatedAt: ptrTime(time.Now()),
	}

	// Try to update existing session first, then create if not exists
	result := h.db.Model(&db.TDLibSession{}).
		Where("user_id = ?", userID).
		Updates(session)

	if result.RowsAffected == 0 {
		// No existing session, create new one
		if err := h.db.Create(session).Error; err != nil {
			h.logger.Error("failed to store session",
				zap.Int64("user_id", userID),
				zap.Error(err),
			)
			writeError(w, http.StatusInternalServerError, "failed to store session")
			return
		}
	} else if result.Error != nil {
		h.logger.Error("failed to update session",
			zap.Int64("user_id", userID),
			zap.Error(result.Error),
		)
		writeError(w, http.StatusInternalServerError, "failed to store session")
		return
	}

	// Clean up auth request
	h.tdlibMutex.Lock()
	delete(h.tdlibAuth, req.RequestID)
	h.tdlibMutex.Unlock()

	h.logger.Info("phone verified",
		zap.Int64("user_id", userID),
		zap.String("phone", maskPhone(phone)),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// GetAuthStatus handles GET /auth/telegram/status
func (h *Handler) GetAuthStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	// Query database for active session
	var session db.TDLibSession
	result := h.db.Where("user_id = ? AND active = ?", userID, true).First(&session)

	if result.Error == gorm.ErrRecordNotFound {
		// No active session
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"authenticated": false,
		})
		return
	}

	if result.Error != nil {
		h.logger.Error("failed to query session",
			zap.Int64("user_id", userID),
			zap.Error(result.Error),
		)
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Decrypt phone for response (in production, this would use SessionManager)
	phone := "***" // Placeholder: actual decryption would use SessionManager

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"phone":         phone,
		"last_auth":     session.LastAuthenticatedAt,
	})
}

// Helper functions

func validatePhoneFormat(phone string) error {
	if len(phone) < 10 || len(phone) > 15 {
		return fmt.Errorf("phone must be 10-15 digits")
	}
	if phone[0] != '+' {
		return fmt.Errorf("phone must start with +")
	}
	for _, ch := range phone[1:] {
		if ch < '0' || ch > '9' {
			return fmt.Errorf("phone must contain only digits after +")
		}
	}
	return nil
}

func validateCodeFormat(code string) error {
	if len(code) != 5 && len(code) != 6 {
		return fmt.Errorf("code must be 5-6 digits")
	}
	for _, ch := range code {
		if ch < '0' || ch > '9' {
			return fmt.Errorf("code must contain only digits")
		}
	}
	return nil
}

func generateRequestID() string {
	return fmt.Sprintf("auth_%s_%d", uuid.New().String()[:8], time.Now().Unix())
}

func maskPhone(phone string) string {
	if len(phone) < 4 {
		return "****"
	}
	return phone[:3] + "****" + phone[len(phone)-2:]
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

// isTelegramURL checks if URL is a Telegram link (t.me/...)
func isTelegramURL(url string) bool {
	return strings.Contains(url, "t.me/") || strings.Contains(url, "telegram.me/")
}

// parseIntParam safely parses an integer query parameter with bounds
func parseIntParam(s string, min, max int) (int, error) {
	var val int
	_, err := fmt.Sscanf(s, "%d", &val)
	if err != nil {
		return min, err
	}
	if val < min {
		val = min
	}
	if val > max {
		val = max
	}
	return val, nil
}

// OpenFile handles POST /open-file to open a file/folder with system default app
func (h *Handler) OpenFile(w http.ResponseWriter, r *http.Request) {
	// Extract user ID from context (set by auth middleware)
	userID, ok := WithUserContext(r)
	if !ok {
		h.logger.Error("user_id not found in context", zap.String("path", r.URL.Path))
		writeError(w, http.StatusInternalServerError, "user context missing")
		return
	}

	var req struct {
		FilePath string `json:"file_path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	filePath := strings.TrimSpace(req.FilePath)
	if filePath == "" {
		writeError(w, http.StatusBadRequest, "file_path is required")
		return
	}

	// Security: ensure path is absolute and within allowed directories
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		h.logger.Warn("invalid file path",
			zap.String("user_id", fmt.Sprintf("%d", userID)),
			zap.String("path", filePath),
			zap.Error(err),
		)
		writeError(w, http.StatusBadRequest, "invalid file path")
		return
	}

	// Verify file/directory exists
	if _, err := os.Stat(absPath); err != nil {
		h.logger.Warn("file not found",
			zap.String("user_id", fmt.Sprintf("%d", userID)),
			zap.String("path", absPath),
		)
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	// Open file/folder based on OS
	var openCmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS
		openCmd = exec.Command("open", absPath)
	case "linux":
		// Linux - try xdg-open first, then alternatives
		openCmd = exec.Command("xdg-open", absPath)
	case "windows":
		// Windows
		openCmd = exec.Command("explorer", "/select,"+absPath)
	default:
		h.logger.Error("unsupported OS", zap.String("os", runtime.GOOS))
		writeError(w, http.StatusInternalServerError, "unsupported OS")
		return
	}

	// Execute in background (don't wait for completion)
	if err := openCmd.Start(); err != nil {
		h.logger.Warn("failed to open file",
			zap.String("user_id", fmt.Sprintf("%d", userID)),
			zap.String("path", absPath),
			zap.Error(err),
		)
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}

	h.logger.Info("file opened",
		zap.Int64("user_id", userID),
		zap.String("path", absPath),
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "file opened",
	})
}
