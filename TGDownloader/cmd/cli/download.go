package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func download(opts downloadOptions) error {
	// Parse URL to extract chat_id and message_id
	chatID, messageID, err := parseURL(opts.URL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	if opts.Verbose {
		fmt.Fprintf(os.Stderr, "📍 Chat ID: %s\n", chatID)
		fmt.Fprintf(os.Stderr, "📮 Message ID: %s\n", messageID)
	}

	// Determine output path
	outputPath := opts.Output
	if outputPath == "" {
		// Auto-generate filename: {channel}_{msg_id}.mp4 or tgdownload_{msg_id}.mp4
		if chatID != "" && !isNumericID(chatID) {
			// chatID is a username/channel name (public channel)
			outputPath = fmt.Sprintf("%s_%s.mp4", chatID, messageID)
		} else {
			// chatID is numeric (private channel) or invalid, use fallback
			outputPath = fmt.Sprintf("tgdownload_%s.mp4", messageID)
		}
	}

	// Expand home directory if needed
	if strings.HasPrefix(outputPath, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("failed to get home directory: %w", err)
		}
		outputPath = filepath.Join(home, outputPath[1:])
	}

	// Create output directory if needed
	outputDir := filepath.Dir(outputPath)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	if opts.Verbose {
		fmt.Fprintf(os.Stderr, "📁 Output: %s\n", outputPath)
	}

	// Find download script
	scriptPath := findDownloadScript()
	if scriptPath == "" {
		return fmt.Errorf("could not find download_tg_video.py script")
	}

	if opts.Verbose {
		fmt.Fprintf(os.Stderr, "🐍 Using script: %s\n", scriptPath)
	}

	// Handle info-only mode (just retrieve metadata without downloading)
	if opts.InfoOnly {
		fmt.Fprintf(os.Stderr, "ℹ️  Retrieving video metadata...\n")

		cmd := exec.Command("python3", scriptPath,
			chatID,
			messageID,
			opts.Phone,
			opts.APIId,
			opts.APIHash,
			outputPath, // Not used in info_only mode
			"0",        // resume_offset
			"1",        // info_only flag
		)

		var stderr bytes.Buffer
		var stdout bytes.Buffer
		cmd.Stderr = &stderr
		cmd.Stdout = &stdout

		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to retrieve metadata: %w", err)
		}

		// Parse and display metadata
		var metadata map[string]interface{}
		if err := json.Unmarshal(stdout.Bytes(), &metadata); err == nil {
			fmt.Fprintf(os.Stderr, "\n📊 Video Information:\n")
			if title, ok := metadata["title"].(string); ok {
				fmt.Fprintf(os.Stderr, "  Title: %s\n", title)
			}
			if duration, ok := metadata["duration"].(float64); ok {
				fmt.Fprintf(os.Stderr, "  Duration: %.0f seconds (%.1f minutes)\n", duration, duration/60)
			}
			if fileSize, ok := metadata["file_size"].(float64); ok {
				fmt.Fprintf(os.Stderr, "  Size: %.2f MB\n", fileSize/(1024*1024))
			}
			if width, ok := metadata["width"].(float64); ok {
				if height, hasHeight := metadata["height"].(float64); hasHeight {
					fmt.Fprintf(os.Stderr, "  Resolution: %.0fx%.0f\n", width, height)
				}
			}
		}
		return nil
	}

	// Run download with retry logic
	fmt.Fprintf(os.Stderr, "⬇️  Downloading from Telegram...\n")

	// Acquire file-based lock for cross-process session safety
	unlock, lockErr := acquireSessionLock()
	if lockErr != nil {
		return fmt.Errorf("failed to acquire session lock: %w", lockErr)
	}
	defer unlock()

	const maxAttempts = 3
	const totalTimeout = 120 * time.Second // 2 minute total limit for all retries

	// Create context with timeout for entire download (including retries)
	ctx, cancel := context.WithTimeout(context.Background(), totalTimeout)
	defer cancel()

	var lastErr error
	var metadata map[string]interface{}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		// Check if context already expired
		select {
		case <-ctx.Done():
			return fmt.Errorf("download timeout after %v", totalTimeout)
		default:
		}

		// Calculate resume offset if file was partially downloaded
		var resumeOffset int64
		if fi, err := os.Stat(outputPath); err == nil {
			resumeOffset = fi.Size()
		}

		// Build command with resume offset and info_only flags
		cmd := exec.CommandContext(ctx, "python3", scriptPath,
			chatID,
			messageID,
			opts.Phone,
			opts.APIId,
			opts.APIHash,
			outputPath,
			fmt.Sprintf("%d", resumeOffset),
			"0", // info_only = false
		)

		var stderr, stdout bytes.Buffer
		cmd.Stderr = &stderr
		cmd.Stdout = &stdout

		lastErr = cmd.Run()
		if lastErr == nil {
			// On first success, parse metadata from stdout
			if attempt == 1 {
				scanner := bufio.NewScanner(bytes.NewReader(stdout.Bytes()))
				if scanner.Scan() {
					firstLine := scanner.Text()
					if err := json.Unmarshal([]byte(firstLine), &metadata); err == nil {
						if opts.Verbose {
							fmt.Fprintf(os.Stderr, "📊 Metadata: %v\n", metadata)
						}
					}
				}
			}
			break // Success
		}

		// Log attempt failure
		if attempt < maxAttempts {
			delay := time.Duration(3) * time.Duration(1<<uint(attempt)) * time.Second // 6s, 12s
			fmt.Fprintf(os.Stderr, "⚠️  Attempt %d/%d failed, retrying in %v...\n", attempt, maxAttempts, delay)
			time.Sleep(delay)
		} else {
			// Last attempt failed
			stderrMsg := stderr.String()
			if stderrMsg != "" {
				fmt.Fprintf(os.Stderr, "\n%s\n", stderrMsg)
			}
		}
	}

	if lastErr != nil {
		return fmt.Errorf("download failed after %d attempts: %w", maxAttempts, lastErr)
	}

	// Verify file was created and has meaningful size
	fileInfo, err := os.Stat(outputPath)
	if err != nil {
		return fmt.Errorf("output file not created: %w", err)
	}

	fileSize := fileInfo.Size()
	const minFileSize = 10 * 1024 // At least 10 KB
	if fileSize < minFileSize {
		return fmt.Errorf("downloaded file too small (%d bytes, minimum %d bytes)", fileSize, minFileSize)
	}

	sizeMB := float64(fileSize) / (1024 * 1024)

	fmt.Fprintf(os.Stderr, "\n✅ Downloaded successfully!\n")
	fmt.Fprintf(os.Stderr, "   File: %s\n", outputPath)
	fmt.Fprintf(os.Stderr, "   Size: %.2f MB (%d bytes)\n", sizeMB, fileSize)

	return nil
}

// parseURL extracts chat_id and message_id from Telegram URL
func parseURL(url string) (chatID, messageID string, err error) {
	// Try post link format first (t.me/s/channel/post_id)
	match := regexp.MustCompile(`(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/s\/([^/?]+)\/(\d+)`).FindStringSubmatch(url)
	if match != nil {
		return match[1], match[2], nil
	}

	// Try regular message format (t.me/c/123456/post_id or t.me/channel/post_id)
	match = regexp.MustCompile(`(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:c\/)?([^/?]+)\/(\d+)`).FindStringSubmatch(url)
	if match != nil {
		return match[1], match[2], nil
	}

	return "", "", fmt.Errorf("unable to parse Telegram URL: %s", url)
}

// isNumericID checks if a string is purely numeric (for private channel IDs)
func isNumericID(id string) bool {
	_, err := strconv.ParseInt(id, 10, 64)
	return err == nil
}

// findDownloadScript looks for the download_tg_video.py script
func findDownloadScript() string {
	// Try relative path from current working directory
	paths := []string{
		"scripts/download_tg_video.py",
		"./scripts/download_tg_video.py",
		"/Users/dex/YD 2026/TGDownloader/scripts/download_tg_video.py",
		"/app/scripts/download_tg_video.py",
	}

	// Also try relative to executable
	if exePath, err := os.Executable(); err == nil {
		paths = append(paths,
			filepath.Join(filepath.Dir(exePath), "../scripts/download_tg_video.py"),
			filepath.Join(filepath.Dir(exePath), "scripts/download_tg_video.py"),
		)
	}

	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	return ""
}
