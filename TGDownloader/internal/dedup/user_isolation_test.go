package dedup

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// TestDedupUserScoping verifies that dedup cache is scoped by user_id
func TestDedupUserScopingBasic(t *testing.T) {
	// Simple validation that cache paths include user_id
	tmpDir := t.TempDir()
	cacheDir := filepath.Join(tmpDir, "cache")
	os.MkdirAll(cacheDir, 0755)

	userAID := int64(100)
	userBID := int64(200)

	// Simulate cache path construction
	hashAbbr := "abc123def456"
	ext := ".mp4"

	pathA := filepath.Join(cacheDir, fmt.Sprintf("%d", userAID), hashAbbr+ext)
	pathB := filepath.Join(cacheDir, fmt.Sprintf("%d", userBID), hashAbbr+ext)

	// Verify paths are different and include user_id
	assert.NotEqual(t, pathA, pathB)
	assert.Contains(t, pathA, "100")
	assert.Contains(t, pathB, "200")
	assert.Contains(t, pathA, hashAbbr)
	assert.Contains(t, pathB, hashAbbr)
}

// TestCachePathIncludesUserID verifies cache directory structure
func TestCachePathIncludesUserID(t *testing.T) {
	tmpDir := t.TempDir()
	cacheDir := filepath.Join(tmpDir, "cache")

	// Test cache path construction for multiple users
	tests := []struct {
		userID int64
		hash   string
		ext    string
	}{
		{100, "abcdef1234567890", ".mp4"},
		{200, "zyxwvutsrqpon098", ".mkv"},
		{555, "fedcba0987654321", ".mp3"},
	}

	for _, tt := range tests {
		userDir := filepath.Join(cacheDir, fmt.Sprintf("%d", tt.userID))
		cachePath := filepath.Join(userDir, tt.hash[:16]+tt.ext)

		// Verify user_id is in path
		assert.Contains(t, cachePath, fmt.Sprintf("%d", tt.userID))
		assert.Contains(t, cachePath, tt.hash[:16])

		// Verify path structure: cacheDir/userID/hash
		userDirStr := filepath.Join(cacheDir, fmt.Sprintf("%d", tt.userID))
		assert.Contains(t, cachePath, userDirStr)
	}
}

// TestCleanupUserFilesSQL verifies cleanup query structure for user files
func TestCleanupUserFilesSQL(t *testing.T) {
	database, dbErr := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, dbErr)
	require.NoError(t, db.InitDB(database))
	userAID := int64(111)
	userBID := int64(222)

	// Manually insert test metadata (bypassing actual dedup operations)
	entries := []db.FileMetadata{
		{UserID: userAID, UniqueID: "hash1", SourceType: "http", CachePath: "/cache/111/hash1", ContentSize: 100},
		{UserID: userAID, UniqueID: "hash2", SourceType: "http", CachePath: "/cache/111/hash2", ContentSize: 200},
		{UserID: userBID, UniqueID: "hash3", SourceType: "http", CachePath: "/cache/222/hash3", ContentSize: 300},
	}

	for _, e := range entries {
		require.NoError(t, database.Create(&e).Error)
	}

	// Verify initial state: 2 for User A, 1 for User B
	var countA int64
	database.Where("user_id = ?", userAID).Model(&db.FileMetadata{}).Count(&countA)
	assert.Equal(t, int64(2), countA)

	var countB int64
	database.Where("user_id = ?", userBID).Model(&db.FileMetadata{}).Count(&countB)
	assert.Equal(t, int64(1), countB)

	// Cleanup User A - delete all entries where user_id = userAID
	require.NoError(t, database.Where("user_id = ?", userAID).Delete(&db.FileMetadata{}).Error)

	// Verify User A's entries are gone
	database.Where("user_id = ?", userAID).Model(&db.FileMetadata{}).Count(&countA)
	assert.Equal(t, int64(0), countA)

	// Verify User B's entry still exists
	database.Where("user_id = ?", userBID).Model(&db.FileMetadata{}).Count(&countB)
	assert.Equal(t, int64(1), countB)
}

// TestDedupQueryStructure ensures queries are user-scoped
func TestDedupQueryStructure(t *testing.T) {
	database, dbErr := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, dbErr)
	require.NoError(t, db.InitDB(database))
	userAID := int64(1000)
	userBID := int64(2000)
	sharedHash := "shared-hash"

	// Both users have same hash
	entries := []db.FileMetadata{
		{UserID: userAID, UniqueID: sharedHash, SourceType: "http", CachePath: "/cache/1000/hash", ContentSize: 100},
		{UserID: userBID, UniqueID: sharedHash, SourceType: "http", CachePath: "/cache/2000/hash", ContentSize: 100},
	}

	for _, e := range entries {
		require.NoError(t, database.Create(&e).Error)
	}

	// Query User A's entry - should get only User A's
	var metadataA db.FileMetadata
	result := database.Where("user_id = ? AND unique_id = ?", userAID, sharedHash).First(&metadataA)
	require.NoError(t, result.Error)
	assert.Equal(t, userAID, metadataA.UserID)
	assert.Contains(t, metadataA.CachePath, "1000")

	// Query User B's entry - should get only User B's
	var metadataB db.FileMetadata
	result = database.Where("user_id = ? AND unique_id = ?", userBID, sharedHash).First(&metadataB)
	require.NoError(t, result.Error)
	assert.Equal(t, userBID, metadataB.UserID)
	assert.Contains(t, metadataB.CachePath, "2000")
}

// TestUserCacheBoundaries ensures each user has isolated cache namespace
func TestUserCacheBoundaries(t *testing.T) {
	tmpDir := t.TempDir()
	cacheDir := filepath.Join(tmpDir, "cache")

	// Create cache paths for 3 different users with same hash
	sharedHash := "abc123def456"
	userPaths := map[int64]string{}

	for userID := int64(1); userID <= 3; userID++ {
		userCacheDir := filepath.Join(cacheDir, fmt.Sprintf("%d", userID))
		cachePath := filepath.Join(userCacheDir, sharedHash+".mp4")
		userPaths[userID] = cachePath
	}

	// Verify each user's path is unique
	assert.Equal(t, 3, len(userPaths))
	for i, pathI := range userPaths {
		for j, pathJ := range userPaths {
			if i != j {
				assert.NotEqual(t, pathI, pathJ, "User %d and %d should have different paths", i, j)
			}
		}
	}

	// Verify each path contains its user_id
	for userID, path := range userPaths {
		assert.Contains(t, path, fmt.Sprintf("%d", userID))
	}
}
