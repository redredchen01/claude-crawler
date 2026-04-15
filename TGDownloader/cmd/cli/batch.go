package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// sessionLock serializes Telethon session access (SQLite is not thread-safe for concurrent writes)
var sessionLock sync.Mutex

// acquireSessionLock uses file-based locking for cross-process session protection
func acquireSessionLock() (func() error, error) {
	lockDir := filepath.Join(os.ExpandEnv("$HOME"), ".tgdownloader")
	os.MkdirAll(lockDir, 0700)
	lockFile := filepath.Join(lockDir, "session.lock")

	// Try to acquire lock with timeout
	for attempt := 0; attempt < 30; attempt++ { // 30 attempts * 100ms = 3s max wait
		f, err := os.OpenFile(lockFile, os.O_CREATE|os.O_WRONLY, 0600)
		if err != nil {
			return nil, fmt.Errorf("failed to open lock file: %w", err)
		}

		// Try non-blocking lock
		err = syscall.Flock(f.Fd(), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			// Lock acquired
			return func() error {
				defer f.Close()
				return syscall.Flock(f.Fd(), syscall.LOCK_UN)
			}, nil
		}

		f.Close()
		if attempt < 29 {
			time.Sleep(100 * time.Millisecond)
		}
	}

	return nil, fmt.Errorf("failed to acquire session lock after 3 seconds")
}

// runBatch processes multiple URLs from a file with concurrent downloads
func runBatch(batchFile string, phone string, apiID string, apiHash string, concurrent int, verbose bool) error {
	// Read URLs from file or stdin
	var file *os.File
	var err error

	if batchFile == "-" {
		file = os.Stdin
	} else {
		file, err = os.Open(batchFile)
		if err != nil {
			return fmt.Errorf("failed to open batch file: %w", err)
		}
		defer file.Close()
	}

	// Parse URLs from file
	urls, err := parseURLs(file)
	if err != nil {
		return fmt.Errorf("failed to parse URLs: %w", err)
	}

	if len(urls) == 0 {
		fmt.Fprintf(os.Stderr, "⚠️  No valid URLs found in batch file\n")
		return nil
	}

	fmt.Fprintf(os.Stderr, "📋 Batch mode: %d URLs, %d concurrent workers\n", len(urls), concurrent)

	// Create worker pool
	urlChan := make(chan string, 1) // Buffer size 1 is sufficient
	var wg sync.WaitGroup
	var successCount, failCount int64 // Use int64 for atomic operations

	// Adjust concurrency based on URL count
	actualConcurrent := concurrent
	if actualConcurrent > len(urls) {
		actualConcurrent = len(urls)
	}

	for i := 0; i < actualConcurrent; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for url := range urlChan {
				// Calculate current position atomically
				idx := atomic.AddInt64(&failCount, 0) + atomic.AddInt64(&successCount, 0) + 1

				fmt.Fprintf(os.Stderr, "  [%d/%d] Downloading: %s\n", idx, len(urls), url)

				opts := downloadOptions{
					URL:      url,
					Output:   "", // auto-generate
					Phone:    phone,
					APIId:    apiID,
					APIHash:  apiHash,
					Verbose:  verbose,
					InfoOnly: false,
				}

				// Acquire file-based lock for cross-process session safety
				unlock, lockErr := acquireSessionLock()
				if lockErr != nil {
					fmt.Fprintf(os.Stderr, "  ❌ [%d/%d] Failed to acquire lock: %v\n", idx, len(urls), lockErr)
					atomic.AddInt64(&failCount, 1)
					continue
				}

				err := download(opts)
				unlock()

				if err != nil {
					fmt.Fprintf(os.Stderr, "  ❌ [%d/%d] Failed: %s — %v\n", idx, len(urls), url, err)
					atomic.AddInt64(&failCount, 1)
				} else {
					fmt.Fprintf(os.Stderr, "  ✅ [%d/%d] Completed: %s\n", idx, len(urls), url)
					atomic.AddInt64(&successCount, 1)
				}
			}
		}(i)
	}

	// Send URLs to workers
	go func() {
		for _, url := range urls {
			urlChan <- url
		}
		close(urlChan)
	}()

	// Wait for all workers to finish
	wg.Wait()

	// Summary
	finalSuccess := atomic.LoadInt64(&successCount)
	finalFail := atomic.LoadInt64(&failCount)
	fmt.Fprintf(os.Stderr, "\n📊 Summary: %d/%d completed, %d failed\n", finalSuccess, len(urls), finalFail)

	if finalFail > 0 {
		return fmt.Errorf("%d download(s) failed", finalFail)
	}

	return nil
}

// parseURLs reads a file and extracts valid Telegram URLs
func parseURLs(file io.Reader) ([]string, error) {
	var urls []string
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Basic URL validation (must contain t.me/)
		if strings.Contains(line, "t.me/") {
			urls = append(urls, line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return urls, nil
}
