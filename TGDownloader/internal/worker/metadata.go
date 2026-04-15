package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
)

// MetadataExtractor handles extraction of file metadata
type MetadataExtractor struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewMetadataExtractor creates a metadata extractor
func NewMetadataExtractor(dbConn *gorm.DB, logger *zap.Logger) *MetadataExtractor {
	return &MetadataExtractor{
		db:     dbConn,
		logger: logger,
	}
}

// Metadata represents extracted file metadata
type Metadata struct {
	DurationMs   *int64  // Duration in milliseconds (video/audio only)
	VideoCodec   *string // Video codec (e.g., h264, vp9, av1)
	AudioCodec   *string // Audio codec (e.g., aac, opus, mp3)
	Width        *int64  // Image/video width in pixels
	Height       *int64  // Image/video height in pixels
	BitRate      *int64  // Bit rate in bits per second
	ContainerFmt *string // Container format (e.g., mp4, webm, mp3)
}

// ffprobeFormat represents ffprobe output for format info
type ffprobeFormat struct {
	Duration string `json:"duration,omitempty"`
	BitRate  string `json:"bit_rate,omitempty"`
	Format   string `json:"format_name,omitempty"`
}

// ffprobeStream represents a single stream in ffprobe output
type ffprobeStream struct {
	CodecType   string `json:"codec_type,omitempty"` // video, audio, subtitle
	CodecName   string `json:"codec_name,omitempty"` // h264, aac, opus, etc.
	Width       int64  `json:"width,omitempty"`
	Height      int64  `json:"height,omitempty"`
	BitRate     string `json:"bit_rate,omitempty"`
}

// ffprobeOutput represents the JSON output from ffprobe
type ffprobeOutput struct {
	Format  ffprobeFormat   `json:"format,omitempty"`
	Streams []ffprobeStream `json:"streams,omitempty"`
}

// ExtractMetadata extracts metadata from a file using ffprobe
// Returns metadata and error. If extraction partially fails (e.g., corrupted file),
// returns partial metadata with a warning log, not an error.
func (e *MetadataExtractor) ExtractMetadata(ctx context.Context, filePath string) (*Metadata, error) {
	// Check file exists
	if _, err := os.Stat(filePath); err != nil {
		return nil, fmt.Errorf("file not accessible: %w", err)
	}

	// Create context with 30-second timeout for metadata extraction
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Run ffprobe with JSON output
	cmd := exec.CommandContext(ctx,
		"ffprobe",
		"-v", "error",
		"-show_format",
		"-show_streams",
		"-of", "json",
		filePath,
	)

	output, err := cmd.Output()
	if err != nil {
		// ffprobe failed - try alternative methods
		e.logger.Warn("ffprobe failed, falling back to identify",
			zap.String("file", filePath),
			zap.Error(err),
		)
		return e.extractMetadataFromIdentify(ctx, filePath)
	}

	// Parse JSON output
	var ffOut ffprobeOutput
	if err := json.Unmarshal(output, &ffOut); err != nil {
		e.logger.Warn("failed to parse ffprobe output",
			zap.String("file", filePath),
			zap.Error(err),
		)
		return nil, fmt.Errorf("parse ffprobe output: %w", err)
	}

	// Extract metadata from parsed output
	return e.parseFFprobeOutput(&ffOut), nil
}

// parseFFprobeOutput converts ffprobe JSON into Metadata struct
func (e *MetadataExtractor) parseFFprobeOutput(ffOut *ffprobeOutput) *Metadata {
	m := &Metadata{}

	// Extract duration from format
	if ffOut.Format.Duration != "" {
		durationSec, err := strconv.ParseFloat(ffOut.Format.Duration, 64)
		if err == nil && durationSec > 0 {
			durationMs := int64(durationSec * 1000)
			m.DurationMs = &durationMs
		}
	}

	// Extract bit rate from format
	if ffOut.Format.BitRate != "" {
		bitRate, err := strconv.ParseInt(ffOut.Format.BitRate, 10, 64)
		if err == nil && bitRate > 0 {
			m.BitRate = &bitRate
		}
	}

	// Extract container format
	if ffOut.Format.Format != "" {
		// Format is often comma-separated like "mov,mp4,m4a,3gp,3g2,mj2"
		parts := strings.Split(ffOut.Format.Format, ",")
		if len(parts) > 0 {
			m.ContainerFmt = &parts[0]
		}
	}

	// Parse streams for codec and dimension info
	for _, stream := range ffOut.Streams {
		switch stream.CodecType {
		case "video":
			codecName := stream.CodecName
			m.VideoCodec = &codecName
			if stream.Width > 0 && stream.Height > 0 {
				m.Width = &stream.Width
				m.Height = &stream.Height
			}
		case "audio":
			codecName := stream.CodecName
			m.AudioCodec = &codecName
		}
	}

	return m
}

// extractMetadataFromIdentify uses ImageMagick identify for image dimensions
// Used as fallback when ffprobe fails (e.g., corrupted video or image-only files)
func (e *MetadataExtractor) extractMetadataFromIdentify(ctx context.Context, filePath string) (*Metadata, error) {
	cmd := exec.CommandContext(ctx,
		"identify",
		"-format", "%[fx:w] %[fx:h]",
		filePath,
	)

	output, err := cmd.Output()
	if err != nil {
		e.logger.Warn("identify also failed, no metadata extracted",
			zap.String("file", filePath),
			zap.Error(err),
		)
		return nil, nil // Gracefully return nil instead of error
	}

	parts := strings.Fields(strings.TrimSpace(string(output)))
	if len(parts) != 2 {
		return nil, nil
	}

	m := &Metadata{}
	if width, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
		m.Width = &width
	}
	if height, err := strconv.ParseInt(parts[1], 10, 64); err == nil {
		m.Height = &height
	}

	return m, nil
}

// StoreMetadata saves extracted metadata to the database
func (e *MetadataExtractor) StoreMetadata(ctx context.Context, taskID string, userID string, filePath string, meta *Metadata) error {
	if meta == nil {
		return nil
	}

	dbMeta := &db.TaskMetadata{
		TaskID:       taskID,
		UserID:       userID,
		DurationMs:   meta.DurationMs,
		VideoCodec:   meta.VideoCodec,
		AudioCodec:   meta.AudioCodec,
		Width:        meta.Width,
		Height:       meta.Height,
		BitRate:      meta.BitRate,
		ContainerFmt: meta.ContainerFmt,
		CreatedAt:    time.Now(),
	}

	return e.db.WithContext(ctx).Create(dbMeta).Error
}
