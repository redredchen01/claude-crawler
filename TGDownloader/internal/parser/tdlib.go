package parser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// parseTDLib parses Telegram message links for TDLib access
// Supports formats:
//   - https://t.me/c/CHANNEL_ID/MESSAGE_ID (private channels)
//   - https://t.me/USERNAME/MESSAGE_ID (public channels)
//   - https://t.me/+HASH/MESSAGE_ID (invitation links)
func parseTDLib(urlStr string) (*types.TaskPayload, error) {
	// Pattern for private channels (c/123456789/MESSAGE_ID)
	privateRegex := regexp.MustCompile(`t\.me/c/(\d+)/(\d+)`)
	matches := privateRegex.FindStringSubmatch(urlStr)

	if len(matches) >= 3 {
		channelID := matches[1]
		messageID := matches[2]

		// Convert to signed chat ID for private channels
		// Private channels: -100 + channel_id
		chatID := "-100" + channelID

		return &types.TaskPayload{
			SourceType:     types.SourceTypeTDLib,
			URL:            urlStr,
			SupportsResume: true, // TDLib supports incremental sync via message_id offset
			Metadata: map[string]interface{}{
				"chat_id":      chatID,
				"message_id":   messageID,
				"channel_type": "private",
			},
		}, nil
	}

	// Pattern for public channels (USERNAME/MESSAGE_ID)
	// Note: Username cannot be just "c" since that's reserved for private channels (t.me/c/...)
	publicRegex := regexp.MustCompile(`t\.me/([a-zA-Z0-9_]{2,})/(\d+)`)
	matches = publicRegex.FindStringSubmatch(urlStr)

	if len(matches) >= 3 {
		username := matches[1]
		messageID := matches[2]

		return &types.TaskPayload{
			SourceType:     types.SourceTypeTDLib,
			URL:            urlStr,
			SupportsResume: true,
			Metadata: map[string]interface{}{
				"username":     username,
				"message_id":   messageID,
				"channel_type": "public",
			},
		}, nil
	}

	// Pattern for invitation links (+HASH/MESSAGE_ID) - these require special handling
	inviteRegex := regexp.MustCompile(`t\.me/\+([a-zA-Z0-9_-]+)/(\d+)`)
	matches = inviteRegex.FindStringSubmatch(urlStr)

	if len(matches) >= 3 {
		inviteHash := matches[1]
		messageID := matches[2]

		return &types.TaskPayload{
			SourceType:     types.SourceTypeTDLib,
			URL:            urlStr,
			SupportsResume: true,
			Metadata: map[string]interface{}{
				"invite_hash": inviteHash,
				"message_id":  messageID,
				"channel_type": "invited",
			},
		}, nil
	}

	return nil, fmt.Errorf("invalid TDLib Telegram link format: %s", urlStr)
}

// ValidateTDLibURL checks if a URL is a valid Telegram link
func ValidateTDLibURL(urlStr string) bool {
	if !strings.Contains(urlStr, "t.me") && !strings.Contains(urlStr, "telegram.me") {
		return false
	}

	// Check for valid pattern
	privateRegex := regexp.MustCompile(`t\.me/c/\d+/\d+`)
	publicRegex := regexp.MustCompile(`t\.me/[a-zA-Z0-9_]+/\d+`)
	inviteRegex := regexp.MustCompile(`t\.me/\+[a-zA-Z0-9_-]+/\d+`)

	return privateRegex.MatchString(urlStr) ||
		publicRegex.MatchString(urlStr) ||
		inviteRegex.MatchString(urlStr)
}

// ExtractMessageID extracts message ID from metadata
func ExtractMessageID(metadata map[string]interface{}) (int64, error) {
	if val, ok := metadata["message_id"]; ok {
		if strVal, ok := val.(string); ok {
			return strconv.ParseInt(strVal, 10, 64)
		}
		if intVal, ok := val.(float64); ok {
			return int64(intVal), nil
		}
		if intVal, ok := val.(int64); ok {
			return intVal, nil
		}
	}
	return 0, fmt.Errorf("message_id not found in metadata")
}

// ExtractChatID extracts chat ID from metadata
func ExtractChatID(metadata map[string]interface{}) (string, error) {
	// Try chat_id first (for private channels)
	if val, ok := metadata["chat_id"]; ok {
		return fmt.Sprintf("%v", val), nil
	}

	// Try username (for public channels)
	if val, ok := metadata["username"]; ok {
		return fmt.Sprintf("%v", val), nil
	}

	// Try invite_hash (for invited channels)
	if val, ok := metadata["invite_hash"]; ok {
		return fmt.Sprintf("%v", val), nil
	}

	return "", fmt.Errorf("no valid chat identifier found in metadata")
}
