package api

import (
	"github.com/redredchen01/tgdownloader-v2/internal/types"
)

// TaskSubmitRequest represents a task submission API request
type TaskSubmitRequest struct {
	SourceType string                 `json:"source_type"` // http, yt_dlp, telegram
	URL        string                 `json:"url"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Validate checks if the request is valid
func (r *TaskSubmitRequest) Validate() error {
	if r.SourceType == "" {
		return &ValidationError{Field: "source_type", Message: "required"}
	}
	if r.URL == "" {
		return &ValidationError{Field: "url", Message: "required"}
	}

	// Validate source type
	switch types.SourceType(r.SourceType) {
	case types.SourceHTTP, types.SourceYtdlp, types.SourceTelegram:
		// valid
	default:
		return &ValidationError{Field: "source_type", Message: "invalid source type"}
	}

	return nil
}

// TaskStatusResponse represents a task status API response
type TaskStatusResponse struct {
	TaskID          string       `json:"task_id"`
	Status          string       `json:"status"`
	ProgressPercent int          `json:"progress_percent"`
	DownloadedBytes int64        `json:"downloaded_bytes"`
	TotalBytes      int64        `json:"total_bytes"`
	ErrorMessage    string       `json:"error_message,omitempty"`
	OutputURLs      []OutputURL  `json:"output_urls,omitempty"`
	Metadata        *TaskMetadata `json:"metadata,omitempty"`
}

// TaskMetadata represents extracted file metadata
type TaskMetadata struct {
	DurationMs   *int64  `json:"duration_ms,omitempty"`   // Video/audio duration in milliseconds
	VideoCodec   *string `json:"video_codec,omitempty"`   // e.g., h264, vp9, av1
	AudioCodec   *string `json:"audio_codec,omitempty"`   // e.g., aac, opus, mp3
	Width        *int64  `json:"width,omitempty"`         // Image/video width in pixels
	Height       *int64  `json:"height,omitempty"`        // Image/video height in pixels
	BitRate      *int64  `json:"bit_rate,omitempty"`      // Bit rate in bits per second
	ContainerFmt *string `json:"container_format,omitempty"` // e.g., mp4, webm, mp3
	ThumbnailURL *string `json:"thumbnail_url,omitempty"` // S3 URL to thumbnail
}

// OutputURL represents a delivery location
type OutputURL struct {
	Type      string `json:"type"`
	URL       string `json:"url"`
	ExpiresAt string `json:"expires_at,omitempty"`
}

// TaskSubmitResponse represents a task submission response
type TaskSubmitResponse struct {
	TaskID    string `json:"task_id"`
	StatusURL string `json:"status_url"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status string `json:"status"`
	Redis  string `json:"redis,omitempty"`
	DB     string `json:"db,omitempty"`
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Message
}
