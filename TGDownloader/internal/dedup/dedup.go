package dedup

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// Manager handles file deduplication and content-addressed caching
type Manager struct {
	db        *gorm.DB
	logger    *zap.Logger
	cacheDir  string
	mu        sync.RWMutex
	cleanupTk *time.Ticker
	stopCh    chan struct{}
}

// Config holds deduplication configuration
type Config struct {
	CacheDir       string
	CleanupInterval time.Duration
	GracePeriod    time.Duration
}

// NewManager creates a new deduplication manager
func NewManager(dbConn *gorm.DB, logger *zap.Logger, cfg *Config) *Manager {
	if cfg.CleanupInterval == 0 {
		cfg.CleanupInterval = 1 * time.Hour
	}
	if cfg.GracePeriod == 0 {
		cfg.GracePeriod = 7 * 24 * time.Hour
	}
	if cfg.CacheDir == "" {
		cfg.CacheDir = "/data/cache"
	}

	// Ensure cache directory exists
	_ = os.MkdirAll(cfg.CacheDir, 0755)

	m := &Manager{
		db:       dbConn,
		logger:   logger,
		cacheDir: cfg.CacheDir,
		stopCh:   make(chan struct{}),
	}

	// Start cleanup goroutine
	go m.cleanupWorker(cfg.CleanupInterval, cfg.GracePeriod)

	return m
}

// CheckOrStore checks if file exists in cache by content hash within a user's namespace.
// User-scoped dedup: files are isolated between users for security.
// If found and valid: returns (true, cachedPath, nil)
// If not found: stores metadata and returns (false, newCachePath, nil)
// If cache validation fails: logs warning, returns (false, "", nil), treats as cache miss
func (m *Manager) CheckOrStore(ctx context.Context, userID int64, sourceType string, filePath string, contentHash string) (bool, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Query for existing entry by content hash within user's namespace (user-scoped dedup)
	var metadata db.FileMetadata
	result := m.db.WithContext(ctx).
		Where("user_id = ? AND unique_id = ?", userID, contentHash).
		First(&metadata)

	if result.Error == gorm.ErrRecordNotFound {
		// Cache miss - proceed to store
		cachePath, err := m.storeMetadata(ctx, userID, sourceType, filePath, contentHash)
		return false, cachePath, err
	}
	if result.Error != nil {
		return false, "", result.Error
	}

	// Found entry - validate cached file
	if !metadata.IsValid() {
		m.logger.Debug("cache entry marked for deletion",
			zap.String("content_hash", contentHash),
			zap.Int64("user_id", userID),
		)
		return false, "", nil
	}

	// Verify cached file exists
	stat, err := os.Stat(metadata.CachePath)
	if err != nil {
		m.logger.Warn("cached file missing or inaccessible",
			zap.String("content_hash", contentHash),
			zap.String("cache_path", metadata.CachePath),
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		m.markCachedFileAsDeleted(ctx, &metadata)
		return false, "", nil
	}

	// Verify file size matches (±1 byte tolerance for edge cases)
	if stat.Size() < metadata.ContentSize-1 || stat.Size() > metadata.ContentSize+1 {
		m.logger.Error("cached file corrupted or size mismatch",
			zap.String("content_hash", contentHash),
			zap.String("cache_path", metadata.CachePath),
			zap.Int64("user_id", userID),
			zap.Int64("expected_size", metadata.ContentSize),
			zap.Int64("actual_size", stat.Size()),
		)
		// Do NOT mark as deleted - let manual intervention handle corruption
		return false, "", nil
	}

	// Cache hit - update last access time and create hardlink
	m.logger.Info("cache hit - reusing file",
		zap.String("content_hash", contentHash[:16]),
		zap.String("cache_path", metadata.CachePath),
		zap.Int64("user_id", userID),
		zap.String("output_path", filePath),
	)

	// Create hardlink atomically
	if err := m.createHardlinkIfNeeded(metadata.CachePath, filePath); err != nil {
		m.logger.Warn("failed to create hardlink, proceeding without dedup",
			zap.Error(err),
		)
		// Silently fall back - don't treat as error
	}

	// Update last access time asynchronously
	go func() {
		metadata.UpdateLastAccess()
		_ = m.db.Model(&metadata).Update("last_access_at", metadata.LastAccessAt)
	}()

	return true, metadata.CachePath, nil
}

// storeMetadata inserts a new file metadata entry after successful download
// Cache path format: {cacheDir}/{user_id}/{hash[:16]}{ext}
// Returns the cache path and any error
func (m *Manager) storeMetadata(ctx context.Context, userID int64, sourceType string, filePath string, contentHash string) (string, error) {
	_, err := os.Stat(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to stat downloaded file: %w", err)
	}

	// Generate cache path based on user_id and content hash for isolation
	userCacheDir := filepath.Join(m.cacheDir, fmt.Sprintf("%d", userID))
	cachePath := filepath.Join(userCacheDir, contentHash[:16]+filepath.Ext(filePath))

	// Ensure user cache directory exists
	if err := os.MkdirAll(userCacheDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create user cache directory: %w", err)
	}

	// Move downloaded file to cache directory if not already there
	// But only if file exists (in testing, file might already be in place)
	if filePath != cachePath {
		if _, err := os.Stat(cachePath); err == nil {
			// Cache file already exists - reuse it
			m.logger.Debug("cache file already exists, reusing",
				zap.String("cache_path", cachePath),
			)
		} else {
			// Move file to cache
			if err := os.Rename(filePath, cachePath); err != nil {
				return "", fmt.Errorf("failed to move file to cache: %w", err)
			}
		}
	}

	// Verify the final cache file
	cacheStat, err := os.Stat(cachePath)
	if err != nil {
		return "", fmt.Errorf("failed to stat cache file after move: %w", err)
	}

	metadata := &db.FileMetadata{
		UserID:      userID,
		UniqueID:    contentHash,
		SourceType:  sourceType,
		CachePath:   cachePath,
		ContentSize: cacheStat.Size(),
		CreatedAt:   time.Now(),
	}

	if err := m.db.WithContext(ctx).Create(metadata).Error; err != nil {
		return "", fmt.Errorf("failed to store metadata: %w", err)
	}

	m.logger.Debug("cache miss - stored new metadata",
		zap.String("content_hash", contentHash[:16]),
		zap.Int64("user_id", userID),
		zap.String("cache_path", cachePath),
		zap.Int64("size", cacheStat.Size()),
	)

	return cachePath, nil
}

// createHardlinkIfNeeded creates a hardlink from cache to output location
// Returns nil if successful or if file already exists with same inode
func (m *Manager) createHardlinkIfNeeded(cachePath string, outputPath string) error {
	// Check if output already exists
	if _, err := os.Stat(outputPath); err == nil {
		// File exists - check if it's already a hardlink to cache
		cacheInfo, _ := os.Stat(cachePath)
		outputInfo, _ := os.Stat(outputPath)
		if os.SameFile(cacheInfo, outputInfo) {
			return nil // Already hardlinked
		}
		// Output file exists but is different - skip to avoid overwrite
		return nil
	}

	// Ensure output directory exists
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return err
	}

	// Create hardlink
	if err := os.Link(cachePath, outputPath); err != nil {
		// Cross-filesystem or permission error - silently fall back
		return err
	}

	return nil
}

// markCachedFileAsDeleted marks a cache entry as deleted (soft delete)
func (m *Manager) markCachedFileAsDeleted(ctx context.Context, metadata *db.FileMetadata) {
	metadata.MarkDeleted()
	_ = m.db.WithContext(ctx).Model(metadata).Update("deleted_at", metadata.DeletedAt)
}

// cleanupWorker runs periodic cleanup of stale cache entries
func (m *Manager) cleanupWorker(interval time.Duration, gracePeriod time.Duration) {
	m.cleanupTk = time.NewTicker(interval)
	defer m.cleanupTk.Stop()

	for {
		select {
		case <-m.cleanupTk.C:
			m.runCleanup(gracePeriod)
		case <-m.stopCh:
			m.logger.Info("dedup cleanup worker stopped")
			return
		}
	}
}

// runCleanup performs the actual cleanup of stale entries
// Cleans up user-scoped cache entries while preserving user-specific files
func (m *Manager) runCleanup(gracePeriod time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	m.mu.RLock()
	defer m.mu.RUnlock()

	// Get all entries (cleanup is global, but respects user_id boundaries)
	var entries []db.FileMetadata
	if err := m.db.WithContext(ctx).Find(&entries).Error; err != nil {
		m.logger.Error("failed to query file metadata for cleanup", zap.Error(err))
		return
	}

	cutoffTime := time.Now().Add(-gracePeriod)
	cleanedCount := 0
	validatedCount := 0

	for _, entry := range entries {
		// Skip entries that are still valid (not marked for deletion)
		if entry.DeletedAt == nil {
			// Validate file still exists and has correct size
			if stat, err := os.Stat(entry.CachePath); err != nil {
				m.logger.Warn("cached file missing during validation",
					zap.String("unique_id", entry.UniqueID),
					zap.String("cache_path", entry.CachePath),
					zap.Error(err),
				)
				// Soft delete the entry
				now := time.Now()
				_ = m.db.WithContext(ctx).Model(&entry).Update("deleted_at", now)
				cleanedCount++
			} else if stat.Size() < entry.ContentSize-1 || stat.Size() > entry.ContentSize+1 {
				m.logger.Error("cached file corrupted during validation",
					zap.String("unique_id", entry.UniqueID),
					zap.String("cache_path", entry.CachePath),
					zap.Int64("expected_size", entry.ContentSize),
					zap.Int64("actual_size", stat.Size()),
				)
				// Mark as corrupted but don't delete - requires manual review
			} else {
				validatedCount++
			}
			continue
		}

		// Entry is marked for deletion - check if grace period has passed
		if entry.DeletedAt.Before(cutoffTime) {
			// Delete from database and optionally from filesystem
			if err := m.db.WithContext(ctx).Delete(&entry).Error; err != nil {
				m.logger.Error("failed to delete expired metadata",
					zap.String("unique_id", entry.UniqueID),
					zap.Error(err),
				)
			} else {
				m.logger.Info("purged expired cache entry",
					zap.String("unique_id", entry.UniqueID),
					zap.String("cache_path", entry.CachePath),
				)
				cleanedCount++
				// Optionally delete the actual file
				_ = os.Remove(entry.CachePath)
			}
		}
	}

	m.logger.Debug("dedup cleanup cycle completed",
		zap.Int("validated", validatedCount),
		zap.Int("cleaned", cleanedCount),
	)
}

// CleanupUserFiles removes all cache entries for a given user
// Called when a user account is deleted to ensure complete isolation
func (m *Manager) CleanupUserFiles(ctx context.Context, userID int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Get all user's cache entries
	var entries []db.FileMetadata
	if err := m.db.WithContext(ctx).Where("user_id = ?", userID).Find(&entries).Error; err != nil {
		m.logger.Error("failed to query user cache entries for cleanup",
			zap.Int64("user_id", userID),
			zap.Error(err),
		)
		return err
	}

	deletedCount := 0
	for _, entry := range entries {
		// Delete from database
		if err := m.db.WithContext(ctx).Delete(&entry).Error; err != nil {
			m.logger.Error("failed to delete user cache entry",
				zap.Int64("user_id", userID),
				zap.String("unique_id", entry.UniqueID),
				zap.Error(err),
			)
			continue
		}

		// Delete the actual file
		if err := os.Remove(entry.CachePath); err != nil && !os.IsNotExist(err) {
			m.logger.Warn("failed to delete user cache file",
				zap.Int64("user_id", userID),
				zap.String("cache_path", entry.CachePath),
				zap.Error(err),
			)
		}
		deletedCount++
	}

	m.logger.Info("cleaned up user cache files",
		zap.Int64("user_id", userID),
		zap.Int("deleted_count", deletedCount),
	)

	return nil
}

// Stop gracefully stops the manager
func (m *Manager) Stop(ctx context.Context) error {
	close(m.stopCh)
	// Wait for cleanup worker to finish
	time.Sleep(100 * time.Millisecond)
	return nil
}

// ComputeHash computes SHA256 hash of a file
func ComputeHash(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// ComputeHashFromReader computes SHA256 hash from a reader
func ComputeHashFromReader(r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
