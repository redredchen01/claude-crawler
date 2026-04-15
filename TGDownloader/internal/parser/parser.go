package parser

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// Parse analyzes a URL and returns a TaskPayload
func Parse(sourceType, urlStr string) (*types.TaskPayload, error) {
	switch types.SourceType(sourceType) {
	case types.SourceHTTP:
		return parseHTTP(urlStr)
	case types.SourceYtdlp:
		return parseYtdlp(urlStr)
	case types.SourceTelegram:
		return parseTelegram(urlStr)
	case types.SourceTypeTDLib:
		return parseTDLib(urlStr)
	default:
		return nil, fmt.Errorf("unknown source type: %s", sourceType)
	}
}

// parseHTTP parses HTTP/HTTPS URLs
func parseHTTP(urlStr string) (*types.TaskPayload, error) {
	u, err := url.Parse(urlStr)
	if err != nil {
		return nil, fmt.Errorf("invalid HTTP URL: %w", err)
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("invalid scheme: %s", u.Scheme)
	}

	// Check if URL supports range requests
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req, _ := http.NewRequest("HEAD", urlStr, nil)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to check URL: %w", err)
	}
	defer resp.Body.Close()

	supportsResume := resp.Header.Get("Accept-Ranges") == "bytes"
	contentLength := int64(0)

	if cl := resp.Header.Get("Content-Length"); cl != "" {
		fmt.Sscanf(cl, "%d", &contentLength)
	}

	return &types.TaskPayload{
		SourceType:     types.SourceHTTP,
		URL:            urlStr,
		SupportsResume: supportsResume,
		FileSizeHint:   contentLength,
	}, nil
}

// parseYtdlp parses URLs that yt-dlp can handle
func parseYtdlp(urlStr string) (*types.TaskPayload, error) {
	// Accept any URL; yt-dlp will validate format
	if !strings.Contains(urlStr, "http") {
		return nil, fmt.Errorf("invalid URL: %s", urlStr)
	}

	return &types.TaskPayload{
		SourceType:     types.SourceYtdlp,
		URL:            urlStr,
		SupportsResume: false, // yt-dlp output may vary, so no resume
	}, nil
}

// parseTelegram parses Telegram message links
func parseTelegram(urlStr string) (*types.TaskPayload, error) {
	// Pattern: https://t.me/c/CHANNEL_ID/MESSAGE_ID or https://t.me/USERNAME/MESSAGE_ID
	chatIDRegex := regexp.MustCompile(`t\.me/(?:c/)?([0-9a-zA-Z_]+)/(\d+)`)
	matches := chatIDRegex.FindStringSubmatch(urlStr)

	if len(matches) < 3 {
		return nil, fmt.Errorf("invalid Telegram link format")
	}

	chatID := matches[1]
	messageID := matches[2]

	return &types.TaskPayload{
		SourceType:     types.SourceTelegram,
		URL:            urlStr,
		SupportsResume: false,
		Metadata: map[string]interface{}{
			"chat_id":    chatID,
			"message_id": messageID,
		},
	}, nil
}
