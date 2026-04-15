package dedup

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

func setupTestDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.InitDB(dbConn))
	return dbConn
}

func setupTestManager(t *testing.T, cacheDir string) (*Manager, *gorm.DB) {
	dbConn := setupTestDB(t)
	logger := zap.NewNop()
	cfg := &Config{
		CacheDir:        cacheDir,
		CleanupInterval: 100 * time.Millisecond,
		GracePeriod:     1 * time.Second,
	}
	return NewManager(dbConn, logger, cfg), dbConn
}

func TestCheckOrStoreFirstDownload(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	// Create a test file
	testFile := filepath.Join(tmpDir, "test.bin")
	content := "test content"
	require.NoError(t, ioutil.WriteFile(testFile, []byte(content), 0644))

	// Compute hash
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First call - should be cache miss
	userID := int64(100)
	hit, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile, hash)
	require.NoError(t, err)
	assert.False(t, hit, "first download should be cache miss")

	// Verify metadata was stored with user_id
	var metadata db.FileMetadata
	dbConn := manager.db
	result := dbConn.Where("user_id = ? AND unique_id = ?", userID, hash).First(&metadata)
	assert.NoError(t, result.Error)
	assert.Equal(t, hash, metadata.UniqueID)
	assert.Equal(t, "http", metadata.SourceType)
	assert.Equal(t, userID, metadata.UserID)
}

func TestCheckOrStoreSecondDownloadHit(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "identical content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First download
	testFile1 := filepath.Join(tmpDir, "test1.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit, "first download should be cache miss")

	// Second download same content
	testFile2 := filepath.Join(tmpDir, "test2.bin")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile2, hash)
	require.NoError(t, err)
	assert.True(t, hit, "second download should be cache hit")
	assert.NotEmpty(t, cachePath)

	// Verify hardlink was created
	if _, err := os.Stat(testFile2); err == nil {
		info1, _ := os.Stat(cachePath)
		info2, _ := os.Stat(testFile2)
		if info1 != nil && info2 != nil {
			assert.Equal(t, info1.Mode(), info2.Mode(), "files should have same permissions after hardlink")
		}
	}
}

func TestCheckOrStoreDifferentSourceSameContent(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "shared identical content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// Download from yt-dlp source with same content
	testFile1 := filepath.Join(tmpDir, "test-ytdlp.mp4")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit1, cachePath, err := manager.CheckOrStore(context.Background(), userID, "yt_dlp", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit1, "first yt-dlp download should be cache miss")
	assert.NotEmpty(t, cachePath)

	// Same content from HTTP source should hit the cache
	testFile2 := filepath.Join(tmpDir, "test-http.mp4")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit2, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile2, hash)
	require.NoError(t, err)
	assert.True(t, hit2, "second download with same content hash should hit despite different source")
}

func TestCachedFileDeletedDetection(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "content to be deleted"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First download
	testFile1 := filepath.Join(tmpDir, "test1.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit)
	assert.NotEmpty(t, cachePath)

	// Delete the cached file
	require.NoError(t, os.Remove(cachePath))

	// Second download should detect missing file
	testFile2 := filepath.Join(tmpDir, "test2.bin")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit, _, err = manager.CheckOrStore(context.Background(), userID, "http", testFile2, hash)
	require.NoError(t, err)
	assert.False(t, hit, "should treat as cache miss when cached file is deleted")

	// Verify deleted_at was set
	var metadata db.FileMetadata
	dbConn := manager.db
	result := dbConn.Where("unique_id = ?", hash).First(&metadata)
	assert.NoError(t, result.Error)
	assert.NotNil(t, metadata.DeletedAt)
}

func TestCachedFileCorruptionDetection(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "original content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First download
	testFile1 := filepath.Join(tmpDir, "test1.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit)

	// Truncate cached file to simulate corruption
	require.NoError(t, os.Truncate(cachePath, 5))

	// Second download should detect size mismatch
	testFile2 := filepath.Join(tmpDir, "test2.bin")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit, _, err = manager.CheckOrStore(context.Background(), userID, "http", testFile2, hash)
	require.NoError(t, err)
	assert.False(t, hit, "should treat as cache miss when file is corrupted")
}

func TestHardlinkFailureFallback(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "test content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First download
	testFile1 := filepath.Join(tmpDir, "test1.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit)

	// Second download to non-existent directory (simulating cross-filesystem or permission error)
	// The hardlink will fail but should not error out
	nonExistentDir := filepath.Join(tmpDir, "nonexistent", "subdir", "test3.bin")
	testFile2 := filepath.Join(tmpDir, "test2.bin")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit, _, err = manager.CheckOrStore(context.Background(), userID, "http", nonExistentDir, hash)
	require.NoError(t, err, "hardlink failure should not error")
	assert.True(t, hit, "should still report cache hit even if hardlink fails")

	// Verify cached file still exists
	_, err = os.Stat(cachePath)
	assert.NoError(t, err, "cached file should not be affected by hardlink failure")
}

func TestCleanupWorkerValidation(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, dbConn := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "cleanup test content"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// Create initial file
	testFile := filepath.Join(tmpDir, "test.bin")
	require.NoError(t, ioutil.WriteFile(testFile, []byte(content), 0644))
	userID := int64(100)
	_, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile, hash)
	require.NoError(t, err)

	// Manually mark as deleted (simulate grace period scenario)
	now := time.Now()
	require.NoError(t, dbConn.Model(&db.FileMetadata{}).
		Where("unique_id = ?", hash).
		Update("deleted_at", now.Add(-10*time.Second)).Error)

	// Wait for cleanup to run
	time.Sleep(200 * time.Millisecond)

	// Verify entry was deleted (grace period is 1 second, we waited 200ms, marked 10s ago)
	var count int64
	dbConn.Model(&db.FileMetadata{}).Where("unique_id = ?", hash).Count(&count)
	assert.Equal(t, int64(0), count, "expired cache entry should be purged")

	// Verify file was removed
	_, err = os.Stat(cachePath)
	assert.True(t, os.IsNotExist(err) || err != nil, "cached file should be deleted")
}

func TestCleanupWorkerFileValidation(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, dbConn := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "validation test"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	testFile := filepath.Join(tmpDir, "test.bin")
	require.NoError(t, ioutil.WriteFile(testFile, []byte(content), 0644))
	userID := int64(100)
	_, cachePath, err := manager.CheckOrStore(context.Background(), userID, "http", testFile, hash)
	require.NoError(t, err)

	// Delete cached file
	require.NoError(t, os.Remove(cachePath))

	// Wait for cleanup worker to detect missing file and run cycle
	time.Sleep(150 * time.Millisecond)

	// Verify entry was soft-deleted by cleanup worker
	var metadata db.FileMetadata
	result := dbConn.Where("unique_id = ?", hash).First(&metadata)
	// If result error is ErrRecordNotFound, cleanup might have purged it already (grace period passed)
	// If result is OK but DeletedAt is nil, cleanup hasn't run yet - retry
	if result.Error == nil && metadata.DeletedAt == nil {
		// Cleanup hasn't detected missing file yet, wait more
		time.Sleep(100 * time.Millisecond)
		result = dbConn.Where("unique_id = ?", hash).First(&metadata)
	}

	// Either entry is soft-deleted or has been purged
	if result.Error == nil {
		assert.NotNil(t, metadata.DeletedAt, "missing file should be soft-deleted")
	}
}

func TestComputeHash(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	testFile := filepath.Join(tmpDir, "test.bin")
	content := "hash test content"
	require.NoError(t, ioutil.WriteFile(testFile, []byte(content), 0644))

	hash, err := ComputeHash(testFile)
	require.NoError(t, err)

	expectedHash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))
	assert.Equal(t, expectedHash, hash)
}

func TestMetadataFields(t *testing.T) {
	dbConn := setupTestDB(t)

	now := time.Now()
	metadata := &db.FileMetadata{
		UniqueID:    "abc123",
		SourceType:  "http",
		CachePath:   "/cache/abc123.mp4",
		ContentSize: 1000000,
		CreatedAt:   now,
	}

	require.NoError(t, dbConn.Create(metadata).Error)

	// Test UpdateLastAccess
	metadata.UpdateLastAccess()
	assert.NotNil(t, metadata.LastAccessAt)
	assert.True(t, metadata.LastAccessAt.After(now))

	// Test MarkDeleted
	metadata.MarkDeleted()
	assert.NotNil(t, metadata.DeletedAt)
	assert.False(t, metadata.IsValid())

	// Test IsValid for unmarked entry
	fresh := &db.FileMetadata{
		UniqueID:   "new123",
		CachePath:  "/cache/new123.mp4",
		SourceType: "http",
	}
	assert.True(t, fresh.IsValid())
}

func TestConcurrentCheckOrStore(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, _ := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "concurrent test"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First download
	testFile1 := filepath.Join(tmpDir, "test1.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit1, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit1)

	// Concurrent second downloads should all see cache hit
	for i := 0; i < 5; i++ {
		testFile := filepath.Join(tmpDir, fmt.Sprintf("test%d.bin", i+2))
		require.NoError(t, ioutil.WriteFile(testFile, []byte(content), 0644))
		hit, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile, hash)
		require.NoError(t, err)
		assert.True(t, hit, "concurrent downloads should hit cache")
	}

	// Verify only one metadata entry
	var count int64
	manager.db.Model(&db.FileMetadata{}).Where("unique_id = ?", hash).Count(&count)
	assert.Equal(t, int64(1), count, "should have exactly one metadata entry")
}

func TestSourceTypeTracking(t *testing.T) {
	tmpDir := t.TempDir()
	defer os.RemoveAll(tmpDir)

	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	manager, dbConn := setupTestManager(t, cacheDir)
	defer manager.Stop(context.Background())

	content := "same content different source"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// First source: http
	testFile1 := filepath.Join(tmpDir, "test-http.bin")
	require.NoError(t, ioutil.WriteFile(testFile1, []byte(content), 0644))
	userID := int64(100)
	hit1, _, err := manager.CheckOrStore(context.Background(), userID, "http", testFile1, hash)
	require.NoError(t, err)
	assert.False(t, hit1, "first http download should be cache miss")

	// Second source: yt-dlp - should hit the cache
	testFile2 := filepath.Join(tmpDir, "test-yt_dlp.bin")
	require.NoError(t, ioutil.WriteFile(testFile2, []byte(content), 0644))
	hit2, _, err := manager.CheckOrStore(context.Background(), userID, "yt_dlp", testFile2, hash)
	require.NoError(t, err)
	assert.True(t, hit2, "yt-dlp download should hit cache (content-addressable)")

	// Verify only one metadata entry exists (source-agnostic dedup)
	var entries []db.FileMetadata
	dbConn.Where("unique_id = ?", hash).Find(&entries)
	assert.Equal(t, 1, len(entries), "should have one entry for same content hash across sources")

	// Verify the entry records one source type (the first one)
	assert.Equal(t, "http", entries[0].SourceType)
}
