package parser

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// TestParseTDLibPrivateChannel tests parsing private channel links
func TestParseTDLibPrivateChannel(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		wantChatID string
		wantMsgID string
		wantError bool
	}{
		{
			name:        "valid private channel",
			url:         "https://t.me/c/1234567890/42",
			wantChatID:  "-1001234567890",
			wantMsgID:   "42",
			wantError:   false,
		},
		{
			name:        "private channel with leading zeros",
			url:         "https://t.me/c/0012345678/999",
			wantChatID:  "-100" + "0012345678",
			wantMsgID:   "999",
			wantError:   false,
		},
		{
			name:      "invalid private channel format",
			url:       "https://t.me/c/notanumber/42",
			wantError: true,
		},
		{
			name:      "invalid message id (letters)",
			url:       "https://t.me/c/1234567890/notanumber",
			wantError: true, // regex requires \d+ for message_id
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task, err := parseTDLib(tt.url)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.NotNil(t, task)
			assert.Equal(t, types.SourceTypeTDLib, task.SourceType)
			assert.Equal(t, tt.url, task.URL)
			assert.True(t, task.SupportsResume)

			// Check metadata
			chatID, ok := task.Metadata["chat_id"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantChatID, chatID)

			msgID, ok := task.Metadata["message_id"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantMsgID, msgID)

			channelType, ok := task.Metadata["channel_type"]
			assert.True(t, ok)
			assert.Equal(t, "private", channelType)
		})
	}
}

// TestParseTDLibPublicChannel tests parsing public channel links
func TestParseTDLibPublicChannel(t *testing.T) {
	tests := []struct {
		name         string
		url          string
		wantUsername string
		wantMsgID    string
		wantError    bool
	}{
		{
			name:         "valid public channel",
			url:          "https://t.me/testchannel/42",
			wantUsername: "testchannel",
			wantMsgID:    "42",
			wantError:    false,
		},
		{
			name:         "public channel with numbers",
			url:          "https://t.me/test_channel_123/999",
			wantUsername: "test_channel_123",
			wantMsgID:    "999",
			wantError:    false,
		},
		{
			name:         "public channel with mixed case",
			url:          "https://t.me/TestChannel/42",
			wantUsername: "TestChannel",
			wantMsgID:    "42",
			wantError:    false,
		},
		{
			name:      "invalid message id",
			url:       "https://t.me/testchannel/abc",
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task, err := parseTDLib(tt.url)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.NotNil(t, task)
			assert.Equal(t, types.SourceTypeTDLib, task.SourceType)
			assert.True(t, task.SupportsResume)

			// Check metadata
			username, ok := task.Metadata["username"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantUsername, username)

			msgID, ok := task.Metadata["message_id"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantMsgID, msgID)

			channelType, ok := task.Metadata["channel_type"]
			assert.True(t, ok)
			assert.Equal(t, "public", channelType)
		})
	}
}

// TestParseTDLibInvitationLink tests parsing invitation links
func TestParseTDLibInvitationLink(t *testing.T) {
	tests := []struct {
		name           string
		url            string
		wantInviteHash string
		wantMsgID      string
		wantError      bool
	}{
		{
			name:           "valid invitation link",
			url:            "https://t.me/+AbCdEfGhIjKlMnOpQrStUv/42",
			wantInviteHash: "AbCdEfGhIjKlMnOpQrStUv",
			wantMsgID:      "42",
			wantError:      false,
		},
		{
			name:           "invitation link with dashes",
			url:            "https://t.me/+AbCdEf-GhIj_KlMnOp/123",
			wantInviteHash: "AbCdEf-GhIj_KlMnOp",
			wantMsgID:      "123",
			wantError:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task, err := parseTDLib(tt.url)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.NotNil(t, task)
			assert.Equal(t, types.SourceTypeTDLib, task.SourceType)
			assert.True(t, task.SupportsResume)

			// Check metadata
			inviteHash, ok := task.Metadata["invite_hash"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantInviteHash, inviteHash)

			msgID, ok := task.Metadata["message_id"]
			assert.True(t, ok)
			assert.Equal(t, tt.wantMsgID, msgID)

			channelType, ok := task.Metadata["channel_type"]
			assert.True(t, ok)
			assert.Equal(t, "invited", channelType)
		})
	}
}

// TestValidateTDLibURL tests URL validation
func TestValidateTDLibURL(t *testing.T) {
	tests := []struct {
		name   string
		url    string
		valid  bool
	}{
		{
			name:  "valid private channel",
			url:   "https://t.me/c/1234567890/42",
			valid: true,
		},
		{
			name:  "valid public channel",
			url:   "https://t.me/testchannel/42",
			valid: true,
		},
		{
			name:  "valid invitation link",
			url:   "https://t.me/+AbCdEfGhIjKlMnOpQrStUv/42",
			valid: true,
		},
		{
			name:  "invalid - no message id",
			url:   "https://t.me/testchannel",
			valid: false,
		},
		{
			name:  "invalid - no t.me domain",
			url:   "https://example.com/testchannel/42",
			valid: false,
		},
		{
			name:  "invalid - http scheme",
			url:   "http://t.me/testchannel/42",
			valid: true, // Should still validate
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := ValidateTDLibURL(tt.url)
			assert.Equal(t, tt.valid, valid)
		})
	}
}

// TestExtractMessageID tests message ID extraction
func TestExtractMessageID(t *testing.T) {
	tests := []struct {
		name      string
		metadata  map[string]interface{}
		wantID    int64
		wantError bool
	}{
		{
			name: "string message id",
			metadata: map[string]interface{}{
				"message_id": "42",
			},
			wantID:    42,
			wantError: false,
		},
		{
			name: "float64 message id",
			metadata: map[string]interface{}{
				"message_id": 42.0,
			},
			wantID:    42,
			wantError: false,
		},
		{
			name: "int64 message id",
			metadata: map[string]interface{}{
				"message_id": int64(42),
			},
			wantID:    42,
			wantError: false,
		},
		{
			name:      "missing message id",
			metadata:  map[string]interface{}{},
			wantError: true,
		},
		{
			name: "invalid string message id",
			metadata: map[string]interface{}{
				"message_id": "not_a_number",
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := ExtractMessageID(tt.metadata)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantID, id)
		})
	}
}

// TestExtractChatID tests chat ID extraction
func TestExtractChatID(t *testing.T) {
	tests := []struct {
		name      string
		metadata  map[string]interface{}
		wantID    string
		wantError bool
	}{
		{
			name: "chat_id field",
			metadata: map[string]interface{}{
				"chat_id": "-1001234567890",
			},
			wantID:    "-1001234567890",
			wantError: false,
		},
		{
			name: "username field",
			metadata: map[string]interface{}{
				"username": "testchannel",
			},
			wantID:    "testchannel",
			wantError: false,
		},
		{
			name: "invite_hash field",
			metadata: map[string]interface{}{
				"invite_hash": "AbCdEfGhIjKlMnOpQrStUv",
			},
			wantID:    "AbCdEfGhIjKlMnOpQrStUv",
			wantError: false,
		},
		{
			name:      "missing all identifiers",
			metadata:  map[string]interface{}{},
			wantError: true,
		},
		{
			name: "chat_id preferred over username",
			metadata: map[string]interface{}{
				"chat_id":  "-1001234567890",
				"username": "testchannel",
			},
			wantID:    "-1001234567890",
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id, err := ExtractChatID(tt.metadata)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantID, id)
		})
	}
}

// TestParseIntegration tests Parse function with TDLib source type
func TestParseIntegration(t *testing.T) {
	tests := []struct {
		name       string
		sourceType string
		url        string
		wantError  bool
	}{
		{
			name:       "TDLib source type",
			sourceType: "tdlib",
			url:        "https://t.me/c/1234567890/42",
			wantError:  false,
		},
		{
			name:       "TDLib public channel",
			sourceType: "tdlib",
			url:        "https://t.me/testchannel/42",
			wantError:  false,
		},
		{
			name:       "invalid TDLib URL",
			sourceType: "tdlib",
			url:        "https://example.com/invalid",
			wantError:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task, err := Parse(tt.sourceType, tt.url)

			if tt.wantError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.NotNil(t, task)
			assert.Equal(t, types.SourceTypeTDLib, task.SourceType)
		})
	}
}
