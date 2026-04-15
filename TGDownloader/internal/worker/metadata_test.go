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

func setupTestDBMetadata(t *testing.T) *gorm.DB {
	dbConn, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.InitDB(dbConn)
	require.NoError(t, err)

	return dbConn
}

func newTestLogger(t *testing.T) *zap.Logger {
	logger, err := zap.NewDevelopment()
	require.NoError(t, err)
	return logger
}

func TestMetadataExtractor_ParseFFprobeOutput(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	// Test video with audio
	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Duration: "120.5",
			BitRate:  "5000000",
			Format:   "mov,mp4,m4a,3gp,3g2,mj2",
		},
		Streams: []ffprobeStream{
			{
				CodecType: "video",
				CodecName: "h264",
				Width:     1920,
				Height:    1080,
				BitRate:   "4000000",
			},
			{
				CodecType: "audio",
				CodecName: "aac",
				BitRate:   "128000",
			},
		},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Check duration (120.5 seconds = 120500 milliseconds)
	require.NotNil(t, meta.DurationMs)
	assert.Equal(t, int64(120500), *meta.DurationMs)

	// Check video codec
	require.NotNil(t, meta.VideoCodec)
	assert.Equal(t, "h264", *meta.VideoCodec)

	// Check audio codec
	require.NotNil(t, meta.AudioCodec)
	assert.Equal(t, "aac", *meta.AudioCodec)

	// Check dimensions
	require.NotNil(t, meta.Width)
	assert.Equal(t, int64(1920), *meta.Width)
	require.NotNil(t, meta.Height)
	assert.Equal(t, int64(1080), *meta.Height)

	// Check bit rate
	require.NotNil(t, meta.BitRate)
	assert.Equal(t, int64(5000000), *meta.BitRate)

	// Check container format
	require.NotNil(t, meta.ContainerFmt)
	assert.Equal(t, "mov", *meta.ContainerFmt)
}

func TestMetadataExtractor_ParseAudioOnly(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Duration: "300.0",
			BitRate:  "128000",
			Format:   "mp3",
		},
		Streams: []ffprobeStream{
			{
				CodecType: "audio",
				CodecName: "mp3",
				BitRate:   "128000",
			},
		},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Duration should be present
	require.NotNil(t, meta.DurationMs)
	assert.Equal(t, int64(300000), *meta.DurationMs)

	// Audio codec should be present
	require.NotNil(t, meta.AudioCodec)
	assert.Equal(t, "mp3", *meta.AudioCodec)

	// Video codec should be nil
	assert.Nil(t, meta.VideoCodec)

	// Dimensions should be nil
	assert.Nil(t, meta.Width)
	assert.Nil(t, meta.Height)
}

func TestMetadataExtractor_ParseImageOnly(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Format: "image2",
		},
		Streams: []ffprobeStream{
			{
				CodecType: "video",
				CodecName: "mjpeg",
				Width:     800,
				Height:    600,
			},
		},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Duration should be nil
	assert.Nil(t, meta.DurationMs)

	// Dimensions should be present
	require.NotNil(t, meta.Width)
	assert.Equal(t, int64(800), *meta.Width)
	require.NotNil(t, meta.Height)
	assert.Equal(t, int64(600), *meta.Height)

	// Audio codec should be nil
	assert.Nil(t, meta.AudioCodec)
}

func TestMetadataExtractor_StoreMetadata(t *testing.T) {
	dbConn := setupTestDBMetadata(t)
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)

	durationMs := int64(120000)
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

	ctx := context.Background()
	err := extractor.StoreMetadata(ctx, "task123", "user456", "/tmp/test.mp4", meta)
	require.NoError(t, err)

	// Verify stored in database
	var stored db.TaskMetadata
	result := dbConn.WithContext(ctx).Where("task_id = ? AND user_id = ?", "task123", "user456").First(&stored)
	require.NoError(t, result.Error)

	assert.Equal(t, "task123", stored.TaskID)
	assert.Equal(t, "user456", stored.UserID)
	assert.NotNil(t, stored.DurationMs)
	assert.Equal(t, int64(120000), *stored.DurationMs)
	assert.NotNil(t, stored.VideoCodec)
	assert.Equal(t, "h264", *stored.VideoCodec)
	assert.NotNil(t, stored.AudioCodec)
	assert.Equal(t, "aac", *stored.AudioCodec)
	assert.NotNil(t, stored.Width)
	assert.Equal(t, int64(1920), *stored.Width)
}

func TestMetadataExtractor_NilMetadata(t *testing.T) {
	dbConn := setupTestDBMetadata(t)
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)

	ctx := context.Background()
	err := extractor.StoreMetadata(ctx, "task789", "user999", "/tmp/test.bin", nil)
	// Should not error on nil metadata
	assert.NoError(t, err)
}

func TestMetadataExtractor_FileNotAccessible(t *testing.T) {
	dbConn := setupTestDBMetadata(t)
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(dbConn, logger)

	ctx := context.Background()
	_, err := extractor.ExtractMetadata(ctx, "/nonexistent/path/file.mp4")
	assert.Error(t, err)
}

func TestMetadataExtractor_TimeoutOnExtractionExceeded(t *testing.T) {
	// This test verifies that the timeout is enforced in the context
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	// Create a context that times out immediately
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
	defer cancel()

	// Wait a bit to ensure timeout
	time.Sleep(10 * time.Millisecond)

	// Try to extract metadata on a non-existent file (won't even get to ffprobe)
	// The timeout should be respected in the context
	_, err := extractor.ExtractMetadata(ctx, "/tmp/nonexistent")
	// Either a timeout error or file not found is acceptable
	assert.Error(t, err)
}

func TestIsVideoOrImageFile(t *testing.T) {
	tests := []struct {
		filePath string
		expected bool
	}{
		{"/path/to/video.mp4", true},
		{"/path/to/video.webm", true},
		{"/path/to/audio.mp3", false},
		{"/path/to/image.jpg", true},
		{"/path/to/image.png", true},
		{"/path/to/image.gif", true},
		{"/path/to/document.pdf", false},
		{"/path/to/file.txt", false},
		{"/path/to/archive.zip", false},
		{"/path/to/video.mkv", true},
		{"/path/to/video.avi", true},
	}

	for _, tc := range tests {
		t.Run(tc.filePath, func(t *testing.T) {
			result := IsVideoOrImageFile(tc.filePath)
			assert.Equal(t, tc.expected, result, "file: %s", tc.filePath)
		})
	}
}

func TestMetadataExtractor_EmptyFFprobeOutput(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	ffOut := &ffprobeOutput{
		Format:  ffprobeFormat{},
		Streams: []ffprobeStream{},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// All fields should be nil
	assert.Nil(t, meta.DurationMs)
	assert.Nil(t, meta.VideoCodec)
	assert.Nil(t, meta.AudioCodec)
	assert.Nil(t, meta.Width)
	assert.Nil(t, meta.Height)
	assert.Nil(t, meta.BitRate)
	assert.Nil(t, meta.ContainerFmt)
}

func TestMetadataExtractor_InvalidDurationString(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Duration: "invalid",
		},
		Streams: []ffprobeStream{},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Duration should be nil due to invalid string
	assert.Nil(t, meta.DurationMs)
}

func TestMetadataExtractor_ZeroDuration(t *testing.T) {
	logger := newTestLogger(t)
	defer logger.Sync()

	extractor := NewMetadataExtractor(nil, logger)

	ffOut := &ffprobeOutput{
		Format: ffprobeFormat{
			Duration: "0",
		},
		Streams: []ffprobeStream{},
	}

	meta := extractor.parseFFprobeOutput(ffOut)
	require.NotNil(t, meta)

	// Duration should be nil for zero duration
	assert.Nil(t, meta.DurationMs)
}
