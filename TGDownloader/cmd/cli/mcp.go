package main

import (
	"fmt"
	"os"

	"github.com/redredchen01/tgdownloader-v2/internal/mcp"
)

func mcpCmd(args []string) {
	// Create MCP server
	server := mcp.NewServer()

	// Register download tool
	downloadTool := &mcp.Tool{
		Name:        "download_telegram_video",
		Description: "Download video or file from Telegram using URL or chat/message IDs",
		InputSchema: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"url": map[string]interface{}{
					"type":        "string",
					"description": "Telegram URL (e.g., t.me/channel/123 or t.me/s/channel/post_id)",
				},
				"output_path": map[string]interface{}{
					"type":        "string",
					"description": "Output file path (optional, defaults to tgdownload_<id>.mp4)",
				},
				"chat_id": map[string]interface{}{
					"type":        "string",
					"description": "Channel ID or username (alternative to url)",
				},
				"message_id": map[string]interface{}{
					"type":        "string",
					"description": "Message or post ID (alternative to url)",
				},
				"phone": map[string]interface{}{
					"type":        "string",
					"description": "Phone number with country code (optional, from TELEGRAM_PHONE env if not provided)",
				},
				"api_id": map[string]interface{}{
					"type":        "string",
					"description": "Telegram API ID (optional, from TELEGRAM_API_ID env if not provided)",
				},
				"api_hash": map[string]interface{}{
					"type":        "string",
					"description": "Telegram API hash (optional, from TELEGRAM_API_HASH env if not provided)",
				},
			},
			"required": []string{},
		},
	}

	server.RegisterTool(downloadTool, func(args map[string]interface{}) (interface{}, error) {
		return handleMCPDownload(args)
	})

	fmt.Fprintf(os.Stderr, "🤖 Starting TGDownloader MCP server...\n")
	if err := server.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ MCP server error: %v\n", err)
		os.Exit(1)
	}
}

func handleMCPDownload(args map[string]interface{}) (interface{}, error) {
	// Extract arguments
	url := ""
	chatID := ""
	messageID := ""
	outputPath := ""
	phone := os.Getenv("TELEGRAM_PHONE")
	apiID := os.Getenv("TELEGRAM_API_ID")
	apiHash := os.Getenv("TELEGRAM_API_HASH")

	if u, ok := args["url"].(string); ok && u != "" {
		url = u
	}
	if cid, ok := args["chat_id"].(string); ok && cid != "" {
		chatID = cid
	}
	if mid, ok := args["message_id"].(string); ok && mid != "" {
		messageID = mid
	}
	if op, ok := args["output_path"].(string); ok && op != "" {
		outputPath = op
	}
	if p, ok := args["phone"].(string); ok && p != "" {
		phone = p
	}
	if aid, ok := args["api_id"].(string); ok && aid != "" {
		apiID = aid
	}
	if ah, ok := args["api_hash"].(string); ok && ah != "" {
		apiHash = ah
	}

	// Build URL if chat_id and message_id provided
	if url == "" && chatID != "" && messageID != "" {
		url = fmt.Sprintf("t.me/%s/%s", chatID, messageID)
	}

	// Validate
	if url == "" {
		return nil, fmt.Errorf("either url or (chat_id + message_id) required")
	}

	if apiID == "" || apiHash == "" {
		return nil, fmt.Errorf("TELEGRAM_API_ID and TELEGRAM_API_HASH required (set env vars or pass as arguments)")
	}

	if phone == "" {
		return nil, fmt.Errorf("phone number required (set TELEGRAM_PHONE env var or pass as argument)")
	}

	// Execute download
	opts := downloadOptions{
		URL:     url,
		Output:  outputPath,
		Phone:   phone,
		APIId:   apiID,
		APIHash: apiHash,
		Verbose: false,
	}

	if err := download(opts); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":  true,
		"message": fmt.Sprintf("Downloaded successfully to %s", opts.Output),
	}, nil
}
