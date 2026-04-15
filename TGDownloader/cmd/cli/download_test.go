package main

import (
	"fmt"
	"testing"
)

// TestParseURL verifies URL parsing for different Telegram link formats
func TestParseURL(t *testing.T) {
	tests := []struct {
		url           string
		expectedChat  string
		expectedMsg   string
		expectErr     bool
	}{
		// Valid URLs
		{
			url:          "https://t.me/i51_co/1406",
			expectedChat: "i51_co",
			expectedMsg:  "1406",
			expectErr:    false,
		},
		{
			url:          "t.me/s/channel_name/5678",
			expectedChat: "channel_name",
			expectedMsg:  "5678",
			expectErr:    false,
		},
		{
			url:          "https://t.me/c/123456/789",
			expectedChat: "123456",
			expectedMsg:  "789",
			expectErr:    false,
		},
		{
			url:          "http://t.me/channel/123",
			expectedChat: "channel",
			expectedMsg:  "123",
			expectErr:    false,
		},
		// Invalid URLs
		{
			url:       "invalid-url",
			expectErr: true,
		},
		{
			url:       "https://example.com/not-telegram",
			expectErr: true,
		},
	}

	for _, tt := range tests {
		chatID, msgID, err := parseURL(tt.url)
		if (err != nil) != tt.expectErr {
			t.Errorf("parseURL(%q) error = %v, wantErr %v", tt.url, err, tt.expectErr)
			continue
		}
		if !tt.expectErr {
			if chatID != tt.expectedChat {
				t.Errorf("parseURL(%q) chatID = %q, want %q", tt.url, chatID, tt.expectedChat)
			}
			if msgID != tt.expectedMsg {
				t.Errorf("parseURL(%q) msgID = %q, want %q", tt.url, msgID, tt.expectedMsg)
			}
		}
	}
}

// TestFindDownloadScript verifies script discovery
func TestFindDownloadScript(t *testing.T) {
	scriptPath := findDownloadScript()
	if scriptPath == "" {
		t.Error("findDownloadScript() should find the script, got empty path")
	}
	if scriptPath != "" && !contains(scriptPath, "download_tg_video.py") {
		t.Errorf("findDownloadScript() returned %q, expected to contain 'download_tg_video.py'", scriptPath)
	}
}

// TestIsNumericID verifies numeric ID detection (for private channel IDs)
func TestIsNumericID(t *testing.T) {
	tests := []struct {
		id       string
		expected bool
	}{
		{"123456", true},
		{"i51_co", false},
		{"channel_name", false},
		{"999", true},
		{"0", true},
		{"-100123456", false}, // Has minus sign
		{"", false},
	}

	for _, tt := range tests {
		result := isNumericID(tt.id)
		if result != tt.expected {
			t.Errorf("isNumericID(%q) = %v, want %v", tt.id, result, tt.expected)
		}
	}
}

// TestAutoNaming verifies default filename generation
func TestAutoNaming(t *testing.T) {
	tests := []struct {
		chatID          string
		messageID       string
		expectedPattern string
	}{
		// Public channel (username) - should use channel name
		{"i51_co", "1406", "i51_co_1406.mp4"},
		// Private channel (numeric) - should use fallback
		{"123456", "789", "tgdownload_789.mp4"},
		// Post format channel - should use channel name
		{"my_channel", "5678", "my_channel_5678.mp4"},
	}

	for _, tt := range tests {
		var outputPath string
		if !isNumericID(tt.chatID) {
			outputPath = fmt.Sprintf("%s_%s.mp4", tt.chatID, tt.messageID)
		} else {
			outputPath = fmt.Sprintf("tgdownload_%s.mp4", tt.messageID)
		}

		if outputPath != tt.expectedPattern {
			t.Errorf("AutoNaming with chatID=%q, msgID=%q = %q, want %q",
				tt.chatID, tt.messageID, outputPath, tt.expectedPattern)
		}
	}
}

// Helper function
func contains(s, substr string) bool {
	for i := 0; i < len(s)-len(substr)+1; i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
