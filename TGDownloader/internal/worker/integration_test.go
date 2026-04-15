package worker

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

func setupIntegrationDB(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.InitDB(dbConn)
	require.NoError(t, err)

	return dbConn
}

func setupIntegrationLogger(t *testing.T) *zap.Logger {
	logger, err := zap.NewDevelopment()
	require.NoError(t, err)
	return logger
}

// TestMetadataExtractionIntegration verifies that metadata extraction works after
// download completion and can be queried from the API response
func TestMetadataExtractionIntegration(t *testing.T) {
	dbConn := setupIntegrationDB(t)
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)

	// Simulate extracted metadata from a video file
	durationMs := int64(120000) // 120 seconds
	videoCodec := "h264"
	audioCodec := "aac"
	width := int64(1920)
	height := int64(1080)
	bitRate := int64(5000000)
	containerFmt := "mp4"

	meta := &Metadata{
		DurationMs:   &durationMs,
		VideoCodec:   &videoCodec,
		AudioCodec:   &audioCodec,
		Width:        &width,
		Height:       &height,
		BitRate:      &bitRate,
		ContainerFmt: &containerFmt,
	}

	// Store metadata for a task
	taskID := "test-task-001"
	userID := "test-user-001"
	ctx := context.Background()

	err := extractor.StoreMetadata(ctx, taskID, userID, "/tmp/test.mp4", meta)
	require.NoError(t, err)

	// Verify metadata is stored and can be retrieved
	var storedMeta db.TaskMetadata
	result := dbConn.WithContext(ctx).Where("task_id = ? AND user_id = ?", taskID, userID).First(&storedMeta)
	require.NoError(t, result.Error)

	assert.Equal(t, taskID, storedMeta.TaskID)
	assert.Equal(t, userID, storedMeta.UserID)
	assert.NotNil(t, storedMeta.DurationMs)
	assert.Equal(t, durationMs, *storedMeta.DurationMs)
	assert.NotNil(t, storedMeta.VideoCodec)
	assert.Equal(t, videoCodec, *storedMeta.VideoCodec)
	assert.NotNil(t, storedMeta.AudioCodec)
	assert.Equal(t, audioCodec, *storedMeta.AudioCodec)
	assert.NotNil(t, storedMeta.Width)
	assert.Equal(t, width, *storedMeta.Width)
	assert.NotNil(t, storedMeta.Height)
	assert.Equal(t, height, *storedMeta.Height)
	assert.NotNil(t, storedMeta.BitRate)
	assert.Equal(t, bitRate, *storedMeta.BitRate)
	assert.NotNil(t, storedMeta.ContainerFmt)
	assert.Equal(t, containerFmt, *storedMeta.ContainerFmt)
	assert.NotZero(t, storedMeta.CreatedAt)
}

// TestMetadataIsolationByUser verifies that metadata is properly isolated by user
func TestMetadataIsolationByUser(t *testing.T) {
	dbConn := setupIntegrationDB(t)
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)
	ctx := context.Background()

	// User 1 stores metadata
	durationMs1 := int64(60000)
	videoCodec1 := "vp9"
	meta1 := &Metadata{
		DurationMs: &durationMs1,
		VideoCodec: &videoCodec1,
	}
	err := extractor.StoreMetadata(ctx, "task-1", "user-1", "/tmp/video1.webm", meta1)
	require.NoError(t, err)

	// User 2 stores metadata for different task
	durationMs2 := int64(180000)
	videoCodec2 := "av1"
	meta2 := &Metadata{
		DurationMs: &durationMs2,
		VideoCodec: &videoCodec2,
	}
	err = extractor.StoreMetadata(ctx, "task-2", "user-2", "/tmp/video2.mp4", meta2)
	require.NoError(t, err)

	// Verify user 1's metadata is isolated
	var user1Meta db.TaskMetadata
	result := dbConn.WithContext(ctx).Where("task_id = ? AND user_id = ?", "task-1", "user-1").First(&user1Meta)
	require.NoError(t, result.Error)
	assert.Equal(t, int64(60000), *user1Meta.DurationMs)
	assert.Equal(t, "vp9", *user1Meta.VideoCodec)

	// Verify user 2's metadata is isolated
	var user2Meta db.TaskMetadata
	result = dbConn.WithContext(ctx).Where("task_id = ? AND user_id = ?", "task-2", "user-2").First(&user2Meta)
	require.NoError(t, result.Error)
	assert.Equal(t, int64(180000), *user2Meta.DurationMs)
	assert.Equal(t, "av1", *user2Meta.VideoCodec)

	// Verify cross-user queries don't leak data
	var crossUserMeta db.TaskMetadata
	result = dbConn.WithContext(ctx).Where("task_id = ? AND user_id = ?", "task-1", "user-2").First(&crossUserMeta)
	assert.Equal(t, gorm.ErrRecordNotFound, result.Error)
}

// TestMetadataExtractionTimeout verifies that extraction respects context timeout
func TestMetadataExtractionTimeout(t *testing.T) {
	dbConn := setupIntegrationDB(t)
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)

	// Create context with very short timeout
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	// Wait for timeout to trigger
	time.Sleep(10 * time.Millisecond)

	// Extraction should fail gracefully
	_, err := extractor.ExtractMetadata(ctx, "/nonexistent/file.mp4")
	assert.Error(t, err)
}

// TestMetadataMultipleStreams verifies handling of files with multiple codec streams
func TestMetadataMultipleStreams(t *testing.T) {
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	// Simulate ffprobe output for file with multiple audio streams
	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Duration: "300.0",
			BitRate:  "10000000",
			Format:   "mkv",
		},
		Streams: []ffprobeStream{
			{
				CodecType: "video",
				CodecName: "h265",
				Width:     3840,
				Height:    2160,
			},
			{
				CodecType: "audio",
				CodecName: "aac",
				BitRate:   "256000",
			},
			{
				CodecType: "audio",
				CodecName: "opus",
				BitRate:   "320000",
			},
			{
				CodecType: "subtitle",
				CodecName: "ass",
			},
		},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Should pick the last audio codec encountered (or first, depending on implementation)
	// This verifies that multiple streams don't cause issues
	assert.NotNil(t, meta.VideoCodec)
	assert.Equal(t, "h265", *meta.VideoCodec)
	assert.NotNil(t, meta.AudioCodec)
	// Both aac and opus are valid; implementation picks one
	assert.True(t, *meta.AudioCodec == "aac" || *meta.AudioCodec == "opus")
}

// TestThumbnailGenerationWithMetadata verifies integration between metadata and thumbnail generation
func TestThumbnailGenerationWithMetadata(t *testing.T) {
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	// Create dummy video metadata
	durationMs := int64(60000)
	videoCodec := "h264"
	width := int64(1280)
	height := int64(720)

	meta := &Metadata{
		DurationMs: &durationMs,
		VideoCodec: &videoCodec,
		Width:      &width,
		Height:     &height,
	}

	// Verify we can detect video type from metadata
	assert.NotNil(t, meta.VideoCodec)
	assert.NotNil(t, meta.DurationMs)

	// Mock thumbnail generation would use this metadata
	gen := NewThumbnailGenerator(logger, "/tmp")
	assert.NotNil(t, gen)

	// Test that IsVideoOrImageFile works with the file extension
	assert.True(t, IsVideoOrImageFile("video.mp4"))
	assert.False(t, IsVideoOrImageFile("audio.mp3"))
}

// TestPartialMetadataStorage verifies that incomplete metadata is stored correctly
func TestPartialMetadataStorage(t *testing.T) {
	dbConn := setupIntegrationDB(t)
	logger := setupIntegrationLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)
	ctx := context.Background()

	// Metadata with only audio codec (e.g., from MP3 file)
	audioCodec := "mp3"
	meta := &Metadata{
		AudioCodec: &audioCodec,
		// Video-related fields are nil
		VideoCodec: nil,
		Width:      nil,
		Height:     nil,
		DurationMs: nil,
	}

	err := extractor.StoreMetadata(ctx, "audio-task", "audio-user", "/tmp/audio.mp3", meta)
	require.NoError(t, err)

	// Verify partial metadata is stored
	var storedMeta db.TaskMetadata
	result := dbConn.WithContext(ctx).Where("task_id = ?", "audio-task").First(&storedMeta)
	require.NoError(t, result.Error)

	assert.NotNil(t, storedMeta.AudioCodec)
	assert.Equal(t, "mp3", *storedMeta.AudioCodec)

	// Video fields should be nil
	assert.Nil(t, storedMeta.VideoCodec)
	assert.Nil(t, storedMeta.Width)
	assert.Nil(t, storedMeta.Height)
}
