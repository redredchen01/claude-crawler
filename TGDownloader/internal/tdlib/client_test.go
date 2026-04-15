package tdlib

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)


func TestNewTDLibClient(t *testing.T) {
	logger := zap.NewNop()
	dbConn := setupTestDB(t)

	// Set encryption key for SessionManager (32 bytes, base64-encoded)
	encryptionKey := "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
	t.Setenv("TDLIB_ENCRYPTION_KEY", encryptionKey)

	tests := []struct {
		name    string
		apiID   string
		apiHash string
		wantErr bool
	}{
		{
			name:    "valid credentials",
			apiID:   "123456",
			apiHash: "abcdef1234567890",
			wantErr: false,
		},
		{
			name:    "missing API ID",
			apiID:   "",
			apiHash: "abcdef1234567890",
			wantErr: true,
		},
		{
			name:    "invalid API ID format",
			apiID:   "not-a-number",
			apiHash: "abcdef1234567890",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewTDLibClient(tt.apiID, tt.apiHash, dbConn, logger)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, client)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, client)
			}
		})
	}
}

func TestInitPhoneAuth(t *testing.T) {
	logger := zap.NewNop()
	dbConn := setupTestDB(t)

	encryptionKey := "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
	t.Setenv("TDLIB_ENCRYPTION_KEY", encryptionKey)

	client, err := NewTDLibClient("123456", "abcdef", dbConn, logger)
	require.NoError(t, err)

	tests := []struct {
		name    string
		phone   string
		wantErr bool
	}{
		{
			name:    "valid phone number",
			phone:   "+886916615712",
			wantErr: false,
		},
		{
			name:    "phone without +",
			phone:   "886916615712",
			wantErr: true,
		},
		{
			name:    "phone too short",
			phone:   "+123",
			wantErr: true,
		},
		{
			name:    "phone with non-digits",
			phone:   "+8869-1661-5712",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requestID, err := client.InitPhoneAuth(context.Background(), tt.phone)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Empty(t, requestID)
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, requestID)
				// Verify auth request was stored
				assert.True(t, len(client.authRequests) > 0)
			}
		})
	}
}

func TestVerifyPhoneCode(t *testing.T) {
	logger := zap.NewNop()
	dbConn := setupTestDB(t)

	encryptionKey := "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
	t.Setenv("TDLIB_ENCRYPTION_KEY", encryptionKey)
	t.Setenv("TELEGRAM_API_ID", "123456")
	t.Setenv("TELEGRAM_API_HASH", "abcdef")

	client, err := NewTDLibClient("123456", "abcdef", dbConn, logger)
	require.NoError(t, err)

	// First, initiate auth
	requestID, err := client.InitPhoneAuth(context.Background(), "+886916615712")
	require.NoError(t, err)
	require.NotEmpty(t, requestID)

	// Test verification
	tests := []struct {
		name      string
		reqID     string
		code      string
		wantErr   bool
		expectMsg string
	}{
		{
			name:    "valid code",
			reqID:   requestID,
			code:    "12345",
			wantErr: false,
		},
		{
			name:      "invalid request ID",
			reqID:     "invalid_id",
			code:      "12345",
			wantErr:   true,
			expectMsg: "request ID not found",
		},
		{
			name:      "code too short",
			reqID:     requestID,
			code:      "123",
			wantErr:   true,
			expectMsg: "invalid code format",
		},
		{
			name:      "code with non-digits",
			reqID:     requestID,
			code:      "1234a",
			wantErr:   true,
			expectMsg: "invalid code format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Re-initiate if needed (since verification cleans up)
			reqID := tt.reqID
			if tt.expectMsg == "" && reqID == requestID {
				// For successful verification, we need a fresh requestID
				var err error
				reqID, err = client.InitPhoneAuth(context.Background(), "+886916615712")
				require.NoError(t, err)
			}

			userID := int64(1)
			err := client.VerifyPhoneCode(context.Background(), userID, reqID, tt.code)
			if tt.wantErr {
				assert.Error(t, err)
				if tt.expectMsg != "" {
					assert.Contains(t, err.Error(), tt.expectMsg)
				}
			} else {
				assert.NoError(t, err)
				// Verify session was stored
				authenticated, creds, err := client.GetAuthStatus(context.Background(), userID)
				assert.NoError(t, err)
				assert.True(t, authenticated)
				assert.NotNil(t, creds)
				assert.Equal(t, "+886916615712", creds.Phone)
			}
		})
	}
}

func TestGetAuthStatus(t *testing.T) {
	logger := zap.NewNop()
	dbConn := setupTestDB(t)

	encryptionKey := "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
	t.Setenv("TDLIB_ENCRYPTION_KEY", encryptionKey)
	t.Setenv("TELEGRAM_API_ID", "123456")
	t.Setenv("TELEGRAM_API_HASH", "abcdef")

	client, err := NewTDLibClient("123456", "abcdef", dbConn, logger)
	require.NoError(t, err)

	userID := int64(1)

	// Test unauthenticated user
	authenticated, creds, err := client.GetAuthStatus(context.Background(), userID)
	assert.NoError(t, err)
	assert.False(t, authenticated)
	assert.Nil(t, creds)

	// Test authenticated user
	reqID, err := client.InitPhoneAuth(context.Background(), "+886916615712")
	require.NoError(t, err)

	err = client.VerifyPhoneCode(context.Background(), userID, reqID, "12345")
	require.NoError(t, err)

	authenticated, creds, err = client.GetAuthStatus(context.Background(), userID)
	assert.NoError(t, err)
	assert.True(t, authenticated)
	assert.NotNil(t, creds)
	assert.Equal(t, "+886916615712", creds.Phone)
}

func TestPhoneValidation(t *testing.T) {
	tests := []struct {
		name    string
		phone   string
		wantErr bool
	}{
		{"valid phone", "+886916615712", false},
		{"valid phone 2", "+1234567890", false},
		{"phone without plus", "886916615712", true},
		{"phone too short", "+123", true},
		{"phone too long", "+12345678901234567", true},
		{"phone with hyphen", "+1234567890-", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePhoneFormat(tt.phone)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestCodeValidation(t *testing.T) {
	tests := []struct {
		name    string
		code    string
		wantErr bool
	}{
		{"valid code 5", "12345", false},
		{"valid code 6", "123456", false},
		{"code too short", "123", true},
		{"code too long", "12345678", true},
		{"code with letter", "1234a", true},
		{"empty code", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			err := validateCodeFormat(tt.code)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
