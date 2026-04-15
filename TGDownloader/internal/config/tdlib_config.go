package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// TDLibConfig holds TDLib-specific configuration
type TDLibConfig struct {
	APIKey           string // API_ID from Telegram
	APIHash          string // API_HASH from Telegram
	Phone            string // Phone number for authentication
	SessionPath      string // Path to store TDLib session files
	Enabled          bool   // Whether TDLib is enabled
	HeartbeatInterval int    // Heartbeat check interval in seconds (default: 600)
	FileIDRefresh    int    // File ID refresh interval in minutes (default: 30)
}

// LoadTDLibConfig loads TDLib configuration from environment variables
func LoadTDLibConfig() *TDLibConfig {
	// Check if TDLib is explicitly disabled
	enabled := os.Getenv("TDLIB_ENABLED") != "false"
	apiID := os.Getenv("TDLIB_API_ID")
	apiHash := os.Getenv("TDLIB_API_HASH")
	phone := os.Getenv("TDLIB_PHONE")

	// If any required credential is missing, disable TDLib
	if apiID == "" || apiHash == "" {
		enabled = false
	}

	sessionPath := os.Getenv("TDLIB_SESSION_PATH")
	if sessionPath == "" {
		sessionPath = filepath.Join(os.TempDir(), "tdlib_sessions")
	}

	heartbeatInterval := 600 // 10 minutes default
	if hb := os.Getenv("TDLIB_HEARTBEAT_INTERVAL"); hb != "" {
		if n, err := strconv.Atoi(hb); err == nil && n > 0 {
			heartbeatInterval = n
		}
	}

	fileIDRefresh := 30 // 30 minutes default
	if fr := os.Getenv("TDLIB_FILE_ID_REFRESH"); fr != "" {
		if n, err := strconv.Atoi(fr); err == nil && n > 0 {
			fileIDRefresh = n
		}
	}

	return &TDLibConfig{
		APIKey:            apiID,
		APIHash:           apiHash,
		Phone:             phone,
		SessionPath:       sessionPath,
		Enabled:           enabled,
		HeartbeatInterval: heartbeatInterval,
		FileIDRefresh:     fileIDRefresh,
	}
}

// Validate validates TDLib configuration
func (cfg *TDLibConfig) Validate() error {
	if !cfg.Enabled {
		return nil
	}

	if cfg.APIKey == "" {
		return fmt.Errorf("TDLIB_API_ID is required")
	}
	if cfg.APIHash == "" {
		return fmt.Errorf("TDLIB_API_HASH is required")
	}

	// Ensure session path exists
	if err := os.MkdirAll(cfg.SessionPath, 0700); err != nil {
		return fmt.Errorf("failed to create TDLIB_SESSION_PATH: %w", err)
	}

	return nil
}
