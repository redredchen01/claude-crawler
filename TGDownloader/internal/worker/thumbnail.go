package worker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"go.uber.org/zap"
)

// ThumbnailGenerator handles thumbnail generation for video/image files
type ThumbnailGenerator struct {
	logger *zap.Logger
	tmpDir string
}

// NewThumbnailGenerator creates a thumbnail generator
func NewThumbnailGenerator(logger *zap.Logger, tmpDir string) *ThumbnailGenerator {
	if tmpDir == "" {
		tmpDir = "/tmp"
	}
	return &ThumbnailGenerator{
		logger: logger,
		tmpDir: tmpDir,
	}
}

// GenerateThumbnail generates a thumbnail for a video/image file
// Returns the local path to the JPEG thumbnail or error.
// Returns (nil, nil) for non-video/non-image files or if thumbnail generation is not applicable.
func (g *ThumbnailGenerator) GenerateThumbnail(ctx context.Context, filePath string, durationMs *int64) (string, error) {
	// Verify file exists
	if _, err := os.Stat(filePath); err != nil {
		return "", fmt.Errorf("file not accessible: %w", err)
	}

	// Create context with 30-second timeout for thumbnail generation
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Generate output path
	baseDir := filepath.Dir(filePath)
	baseName := filepath.Base(filePath)
	ext := filepath.Ext(baseName)
	outputPath := filepath.Join(baseDir, fmt.Sprintf(".%s.thumbnail.jpg", baseDir[:len(baseDir)-len(ext)]))

	// Determine seek position: 25% of duration, or 5 seconds for unknown duration
	var seekPos string
	if durationMs != nil && *durationMs > 0 {
		posMs := (*durationMs) / 4 // 25% of duration
		posSec := posMs / 1000
		seekPos = fmt.Sprintf("%d", posSec)
	} else {
		seekPos = "5" // Default to 5 seconds
	}

	// Use ffmpeg to extract frame at seek position
	cmd := exec.CommandContext(ctx,
		"ffmpeg",
		"-ss", seekPos,
		"-i", filePath,
		"-vf", "scale=-1:180",
		"-q:v", "2",
		"-y", // Overwrite
		outputPath,
	)

	// Suppress ffmpeg verbose output
	cmd.Stderr = nil
	cmd.Stdout = nil

	if err := cmd.Run(); err != nil {
		g.logger.Warn("failed to generate thumbnail",
			zap.String("file", filePath),
			zap.Error(err),
		)
		// Return nil, nil for non-video files or extraction failure
		// Thumbnail is optional and should not fail the download
		return "", nil
	}

	// Verify thumbnail was created
	if _, err := os.Stat(outputPath); err != nil {
		g.logger.Warn("thumbnail file not created",
			zap.String("output_path", outputPath),
			zap.Error(err),
		)
		return "", nil
	}

	g.logger.Info("thumbnail generated",
		zap.String("file", filePath),
		zap.String("output", outputPath),
	)

	return outputPath, nil
}

// IsVideoOrImageFile returns true if the file extension suggests it's a video or image
func IsVideoOrImageFile(filePath string) bool {
	ext := filepath.Ext(filePath)
	if ext == "" {
		return false
	}
	ext = ext[1:] // Remove leading dot

	videoExts := []string{"mp4", "webm", "mkv", "avi", "mov", "flv", "wmv", "m4v", "3gp", "ogv", "ts", "m3u8"}
	imageExts := []string{"jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "ico"}

	extsMap := make(map[string]bool)
	for _, e := range videoExts {
		extsMap[e] = true
	}
	for _, e := range imageExts {
		extsMap[e] = true
	}

	return extsMap[ext]
}
