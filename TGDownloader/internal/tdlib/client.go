package tdlib

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

// TDLibClient wraps TDLib client for Telegram authentication and file operations
type TDLibClient struct {
	mu             sync.RWMutex
	apiID          string
	apiHash        string
	sessionManager *SessionManager
	dbConn         *gorm.DB
	logger         *zap.Logger
	authRequests   map[string]*authRequest // request_id -> auth request
}

type authRequest struct {
	Phone     string
	RequestID string
	CreatedAt time.Time
	CodeSent  bool
}

// NewTDLibClient creates a new TDLib client wrapper
func NewTDLibClient(apiID, apiHash string, dbConn *gorm.DB, logger *zap.Logger) (*TDLibClient, error) {
	if apiID == "" || apiHash == "" {
		return nil, fmt.Errorf("API ID and API Hash are required")
	}

	// Validate API ID is numeric
	if !isNumeric(apiID) {
		return nil, fmt.Errorf("invalid API ID format: must be numeric")
	}

	sessionMgr, err := NewSessionManager(dbConn)
	if err != nil {
		return nil, fmt.Errorf("failed to create session manager: %w", err)
	}

	return &TDLibClient{
		apiID:          apiID,
		apiHash:        apiHash,
		sessionManager: sessionMgr,
		dbConn:         dbConn,
		logger:         logger,
		authRequests:   make(map[string]*authRequest),
	}, nil
}

// InitPhoneAuth initiates phone number authentication
// Returns request_id which user must provide along with verification code
func (tc *TDLibClient) InitPhoneAuth(ctx context.Context, phone string) (string, error) {
	// Validate phone format (basic E.164 check)
	if err := validatePhoneFormat(phone); err != nil {
		return "", fmt.Errorf("invalid phone format: %w", err)
	}

	tc.logger.Info("initiating phone authentication",
		zap.String("phone", maskPhone(phone)),
	)

	// Generate request ID
	reqID := generateRequestID()

	tc.mu.Lock()
	tc.authRequests[reqID] = &authRequest{
		Phone:     phone,
		RequestID: reqID,
		CreatedAt: time.Now(),
		CodeSent:  false,
	}
	tc.mu.Unlock()

	// In a real implementation, this would:
	// 1. Create TDLib client
	// 2. Connect to Telegram servers
	// 3. Initiate phone auth flow
	// 4. Send code via Telegram app
	// For now, we mark that auth has been initiated

	tc.logger.Info("phone auth initiated, waiting for verification code",
		zap.String("request_id", reqID),
		zap.String("phone", maskPhone(phone)),
	)

	return reqID, nil
}

// VerifyPhoneCode verifies the code sent to user's Telegram app
// Returns encrypted session for storage in database
func (tc *TDLibClient) VerifyPhoneCode(ctx context.Context, userID int64, requestID string, code string) error {
	tc.mu.Lock()
	authReq, exists := tc.authRequests[requestID]
	tc.mu.Unlock()

	if !exists {
		return fmt.Errorf("request ID not found or expired")
	}

	// Validate code format
	if err := validateCodeFormat(code); err != nil {
		return fmt.Errorf("invalid code format: %w", err)
	}

	// Check if request is still fresh (5 minute timeout)
	if time.Since(authReq.CreatedAt) > 5*time.Minute {
		tc.mu.Lock()
		delete(tc.authRequests, requestID)
		tc.mu.Unlock()
		return fmt.Errorf("request expired")
	}

	tc.logger.Info("verifying phone code",
		zap.String("phone", maskPhone(authReq.Phone)),
		zap.Int64("user_id", userID),
	)

	// In a real implementation, we would:
	// 1. Use authReq.ClientHandle to submit the code
	// 2. Complete TDLib authentication
	// 3. Save session to database

	// For now, we'll create a placeholder session in the database
	// The actual TDLib session handling would be implemented in a more complete version
	credentials := &PlaintextCredentials{
		APIID:   os.Getenv("TELEGRAM_API_ID"),
		APIHash: os.Getenv("TELEGRAM_API_HASH"),
		Phone:   authReq.Phone,
	}

	if err := tc.sessionManager.SetUserSession(userID, credentials.APIID, credentials.APIHash, credentials.Phone); err != nil {
		return fmt.Errorf("failed to store session: %w", err)
	}

	tc.logger.Info("phone code verified, session stored",
		zap.Int64("user_id", userID),
		zap.String("phone", maskPhone(authReq.Phone)),
	)

	// Cleanup auth request
	tc.mu.Lock()
	delete(tc.authRequests, requestID)
	tc.mu.Unlock()

	return nil
}

// GetAuthStatus checks if user has an active authenticated session
func (tc *TDLibClient) GetAuthStatus(ctx context.Context, userID int64) (bool, *PlaintextCredentials, error) {
	credentials, err := tc.sessionManager.GetUserSession(userID)
	if err != nil {
		// No session found is not an error, just return false
		return false, nil, nil
	}

	return true, credentials, nil
}

// GetUserSession retrieves stored session for a user
func (tc *TDLibClient) GetUserSession(userID int64) (*PlaintextCredentials, error) {
	return tc.sessionManager.GetUserSession(userID)
}

// Cleanup closes TDLib clients and clears sessions
func (tc *TDLibClient) Cleanup(ctx context.Context) error {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	tc.authRequests = make(map[string]*authRequest)

	return nil
}

// Helper functions

func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func validatePhoneFormat(phone string) error {
	if len(phone) < 10 || len(phone) > 15 {
		return fmt.Errorf("phone must be 10-15 digits")
	}
	// Must start with +
	if phone[0] != '+' {
		return fmt.Errorf("phone must start with +")
	}
	// Rest should be digits
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

func maskPhone(phone string) string {
	if len(phone) < 4 {
		return "****"
	}
	return phone[:3] + "****" + phone[len(phone)-2:]
}

func generateRequestID() string {
	return fmt.Sprintf("auth_%d_%d", time.Now().Unix(), time.Now().Nanosecond()%1000)
}
