package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
)

// API response structures
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type DownloadDirResponse struct {
	Path string `json:"path"`
	Desc string `json:"desc"`
}

type DownloadRequest struct {
	URL        string `json:"url"`
	Compress   bool   `json:"compress,omitempty"`   // Enable video compression after download
	Preset     string `json:"preset,omitempty"`     // Compression preset: archive, mezzanine, delivery, preview
}

type DownloadProgress struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	Progress int    `json:"progress"`
	File     string `json:"file,omitempty"`
}

var downloadDir string

// Session lock to prevent concurrent access to Telegram session
var sessionMutex sync.Mutex

func init() {
	// Determine download directory
	homeDir := os.Getenv("HOME")
	if homeDir == "" {
		if u, err := user.Current(); err == nil {
			homeDir = u.HomeDir
		}
	}
	downloadDir = filepath.Join(homeDir, ".tgdownloader", "downloads")

	// Create directory if it doesn't exist
	os.MkdirAll(downloadDir, 0755)
}

// openFolder opens the directory using system-native file manager
func openFolder(dirPath string) error {
	// Ensure directory exists
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return err
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: use open command
		cmd = exec.Command("open", dirPath)
	case "linux":
		// Linux: try xdg-open or nautilus/thunar
		cmd = exec.Command("xdg-open", dirPath)
	case "windows":
		// Windows: use explorer
		cmd = exec.Command("explorer", dirPath)
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	// Run the command without blocking
	return cmd.Start()
}

// handleOpenFolder opens the downloads folder
func handleOpenFolder(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if err := openFolder(downloadDir); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to open folder: %v", err),
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Folder opened successfully",
		Data: DownloadDirResponse{
			Path: downloadDir,
			Desc: "Downloads folder opened in file manager",
		},
	})
}

// handleGetDownloadDir returns the download directory path
func handleGetDownloadDir(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Message: "Download directory info",
		Data: DownloadDirResponse{
			Path: downloadDir,
			Desc: "Default download folder for TGDownloader",
		},
	})
}

// extractChatAndMsgID extracts chat_id and message_id from Telegram URL
func extractChatAndMsgID(url string) (string, string, error) {
	// Match patterns like: t.me/channel/123, t.me/s/channel/456, t.me/c/123/456
	// NOTE: Order matters! More specific patterns must come first
	patterns := []string{
		`t\.me/c/(\d+)/(\d+)`,                   // t.me/c/chat_id/msg_id (MUST be first to match before generic pattern)
		`t\.me/s/([a-zA-Z0-9_]+)/(\d+)`,        // t.me/s/channel/post_id
		`t\.me/([a-zA-Z0-9_]+)/(\d+)`,          // t.me/channel/msg_id
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(url)
		if len(matches) >= 3 {
			return matches[1], matches[2], nil
		}
	}

	return "", "", fmt.Errorf("invalid Telegram URL format")
}

// handleDownload handles single video download
func handleDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Only POST method allowed",
		})
		return
	}

	var req DownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	log.Printf("[API] Download request URL: %s", req.URL)

	// Set up SSE response
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Message: "Streaming not supported",
		})
		return
	}

	// Extract chat_id and message_id from URL
	chatID, msgID, err := extractChatAndMsgID(req.URL)
	log.Printf("[API] Extracted: chatID=%s, msgID=%s, err=%v", chatID, msgID, err)
	if err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("❌ URL 格式错误\n\n正确格式:\n• https://t.me/channel/123\n• https://t.me/s/channel/456\n\n你输入的: %s\n\n错误: %v", req.URL, err),
			Progress: 0,
		})
		return
	}

	// Get environment variables
	phone := os.Getenv("TELEGRAM_PHONE")
	if phone == "" {
		sendProgress(w, flusher, DownloadProgress{
			Status:  "error",
			Message: "TELEGRAM_PHONE environment variable not set",
			Progress: 0,
		})
		return
	}

	apiID := os.Getenv("TELEGRAM_API_ID")
	if apiID == "" {
		sendProgress(w, flusher, DownloadProgress{
			Status:  "error",
			Message: "TELEGRAM_API_ID environment variable not set",
			Progress: 0,
		})
		return
	}

	apiHash := os.Getenv("TELEGRAM_API_HASH")
	if apiHash == "" {
		sendProgress(w, flusher, DownloadProgress{
			Status:  "error",
			Message: "TELEGRAM_API_HASH environment variable not set",
			Progress: 0,
		})
		return
	}

	// Build output filename
	outputFile := filepath.Join(downloadDir, fmt.Sprintf("tgdownload_%s_%s.mp4", chatID, msgID))

	sendProgress(w, flusher, DownloadProgress{
		Status:   "info",
		Message:  fmt.Sprintf("开始下载: %s", req.URL),
		Progress: 5,
	})

	// Lock session to prevent concurrent downloads that would cause database lock
	sessionMutex.Lock()
	defer sessionMutex.Unlock()

	log.Printf("[SESSION] Acquired lock for download: %s/%s", chatID, msgID)

	// Call Python download script - use current working directory
	wd, _ := os.Getwd()
	scriptPath := filepath.Join(wd, "scripts", "download_tg_video.py")
	if _, err := os.Stat(scriptPath); err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("Script not found: %s", scriptPath),
			Progress: 0,
		})
		return
	}

	cmd := exec.Command("python3", scriptPath, chatID, msgID, phone, apiID, apiHash, outputFile)

	// Set environment variables for the process
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("TELEGRAM_PHONE=%s", phone),
		fmt.Sprintf("TELEGRAM_API_ID=%s", apiID),
		fmt.Sprintf("TELEGRAM_API_HASH=%s", apiHash),
	)

	// Create pipes to read stdout and stderr separately
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("Failed to create stdout pipe: %v", err),
			Progress: 0,
		})
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("Failed to create stderr pipe: %v", err),
			Progress: 0,
		})
		return
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("Failed to start download: %v", err),
			Progress: 0,
		})
		return
	}

	// Read stderr in background to log errors
	go func() {
		stderrScanner := bufio.NewScanner(stderr)
		for stderrScanner.Scan() {
			line := stderrScanner.Text()
			log.Printf("[STDERR] %s", line)
		}
	}()

	// Read stdout line by line
	scanner := bufio.NewScanner(stdout)
	progress := 10
	metadataReceived := false

	for scanner.Scan() {
		line := scanner.Text()
		log.Printf("[STDOUT] %s", line)

		// Try to parse JSON metadata (should be first line)
		var metadata map[string]interface{}
		if !metadataReceived && json.Unmarshal([]byte(line), &metadata) == nil {
			metadataReceived = true
			sendProgress(w, flusher, DownloadProgress{
				Status:   "metadata",
				Message:  fmt.Sprintf("✓ 元数据获取完成"),
				Progress: 20,
			})
			continue
		}

		// Skip empty lines
		if len(line) == 0 {
			continue
		}

		// Update progress
		progress += 5
		if progress > 90 {
			progress = 90
		}

		sendProgress(w, flusher, DownloadProgress{
			Status:   "info",
			Message:  line,
			Progress: progress,
		})
	}

	// Wait for command to complete
	waitErr := cmd.Wait()
	log.Printf("[DOWNLOAD] Command exit: %v", waitErr)

	// Check if file was created (more reliable than exit code)
	if fileInfo, err := os.Stat(outputFile); err == nil {
		// File exists - success regardless of exit code
		downloadedSize := float64(fileInfo.Size()) / 1024 / 1024

		sendProgress(w, flusher, DownloadProgress{
			Status:   "success",
			Message:  fmt.Sprintf("✓ 下载完成: %s (%.2f MB)", filepath.Base(outputFile), downloadedSize),
			Progress: 100,
			File:     filepath.Base(outputFile),
		})
		log.Printf("[DOWNLOAD] File saved: %s (%d bytes)", outputFile, fileInfo.Size())

		// Handle optional compression
		if req.Compress {
			compressVideo(w, flusher, outputFile, req.Preset, downloadedSize)
		}
	} else {
		// File not found - error
		if waitErr != nil {
			sendProgress(w, flusher, DownloadProgress{
				Status:   "error",
				Message:  fmt.Sprintf("Download failed: %v", waitErr),
				Progress: 0,
			})
		} else {
			sendProgress(w, flusher, DownloadProgress{
				Status:   "error",
				Message:  "Download completed but file not found",
				Progress: 0,
			})
		}
	}
}

// compressVideo compresses the downloaded video using the transcode skill
func compressVideo(w http.ResponseWriter, flusher http.Flusher, inputFile, preset string, originalSize float64) {
	if preset == "" {
		preset = "archive_lossless" // Default preset (lossless)
	}

	sendProgress(w, flusher, DownloadProgress{
		Status:   "compressing",
		Message:  fmt.Sprintf("🗜️  开始压缩... (预设: %s)", preset),
		Progress: 90,
	})

	wd, _ := os.Getwd()
	skillPath := filepath.Join(wd, "scripts", "video-transcode-skill-v1.1.js")
	outputDir := filepath.Dir(inputFile)

	// The transcode skill outputs as: {inputName}_encoded.mp4
	inputBaseName := filepath.Base(inputFile)
	inputNameWithoutExt := inputBaseName[:len(inputBaseName)-len(filepath.Ext(inputBaseName))]
	outputFile := filepath.Join(outputDir, inputNameWithoutExt+"_encoded.mp4")

	// Call the transcode skill
	cmd := exec.Command("node", skillPath,
		"-i", inputFile,
		"-o", outputDir,
		"-p", preset,
	)

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("压缩失败: %v", err),
			Progress: 0,
		})
		log.Printf("[COMPRESS] Failed to start: %v", err)
		return
	}

	// Read compression output
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		log.Printf("[COMPRESS] %s", line)
	}

	// Read stderr for progress/warnings
	go func() {
		stderrScanner := bufio.NewScanner(stderr)
		for stderrScanner.Scan() {
			log.Printf("[COMPRESS-ERR] %s", stderrScanner.Text())
		}
	}()

	// Wait for completion
	if err := cmd.Wait(); err != nil {
		sendProgress(w, flusher, DownloadProgress{
			Status:   "error",
			Message:  fmt.Sprintf("压缩失败: %v", err),
			Progress: 0,
		})
		log.Printf("[COMPRESS] Process failed: %v", err)
		return
	}

	// Check if compressed file exists
	if compressedInfo, err := os.Stat(outputFile); err == nil {
		compressedSize := float64(compressedInfo.Size()) / 1024 / 1024
		ratio := (1 - compressedSize/originalSize) * 100

		sendProgress(w, flusher, DownloadProgress{
			Status:   "compressed",
			Message:  fmt.Sprintf("✓ 压缩完成: %s (%.2f MB, 节省 %.1f%%)", filepath.Base(outputFile), compressedSize, ratio),
			Progress: 100,
			File:     filepath.Base(outputFile),
		})
		log.Printf("[COMPRESS] File compressed: %s (%.2f MB, saved %.1f%%)", outputFile, compressedSize, ratio)
	} else {
		// Compression may have failed or output file name was different
		// Try to find the output file
		log.Printf("[COMPRESS] Warning: expected output file not found at %s, checking directory", outputFile)
		sendProgress(w, flusher, DownloadProgress{
			Status:   "warning",
			Message:  "压缩已完成，但输出文件位置与预期不同",
			Progress: 100,
		})
	}
}

// sendProgress sends a progress update via Server-Sent Events (SSE)
func sendProgress(w http.ResponseWriter, flusher http.Flusher, progress DownloadProgress) {
	data, _ := json.Marshal(progress)
	fmt.Fprintf(w, "data: %s\n\n", string(data))
	flusher.Flush()
}

// serveIndex serves the main HTML file
func serveIndex(w http.ResponseWriter, r *http.Request) {
	// Don't handle API routes
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprint(w, "404 page not found")
		return
	}

	// Serve index.html for root path and all routes (single-page app)
	if r.URL.Path == "/" || r.URL.Path == "/index.html" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeFile(w, r, "index.html")
		return
	}

	// Serve other static files
	http.ServeFile(w, r, r.URL.Path[1:])
}

// logRequest logs HTTP requests
func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[%s] %s %s", r.Method, r.URL.Path, r.RemoteAddr)
		handler.ServeHTTP(w, r)
	})
}

func main() {
	// Change to the directory where the binary is located
	// so it can find index.html
	if wd, err := os.Getwd(); err == nil {
		log.Printf("Working directory: %s", wd)
	}

	// API routes
	http.HandleFunc("/api/open-folder", handleOpenFolder)
	http.HandleFunc("/api/download-dir", handleGetDownloadDir)
	http.HandleFunc("/api/download", handleDownload)

	// Static file serving (for index.html)
	http.HandleFunc("/", serveIndex)

	// Determine port
	port := ":8888"
	if p := os.Getenv("PORT"); p != "" {
		port = ":" + p
	}

	// Start server
	log.Printf("Starting TGDownloader UI server")
	log.Printf("📂 Download folder: %s", downloadDir)
	log.Printf("🌐 Server: http://localhost%s/index.html", port)
	log.Printf("Press Ctrl+C to stop")

	if err := http.ListenAndServe(port, logRequest(http.DefaultServeMux)); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
