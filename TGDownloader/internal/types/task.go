package types

import (
	"encoding/json"
	"time"
)

// TaskState represents the current state of a download task
type TaskState string

const (
	StatePending     TaskState = "pending"
	StateDownloading TaskState = "downloading"
	StateProcessing  TaskState = "processing"
	StateUploading   TaskState = "uploading"
	StateDone        TaskState = "done"
	StateFailed      TaskState = "failed"
)

// SourceType represents the download source
type SourceType string

const (
	SourceHTTP      SourceType = "http"
	SourceYtdlp     SourceType = "yt_dlp"
	SourceTelegram  SourceType = "telegram"
	SourceTypeTDLib SourceType = "tdlib"
)

// TaskPayload represents a download task
type TaskPayload struct {
	ID              string                 `json:"task_id"`
	UserID          int64                  `json:"user_id"` // For multi-user isolation
	SourceType      SourceType             `json:"source_type"`
	URL             string                 `json:"url"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
	SupportsResume  bool                   `json:"supports_resume"`
	FileSizeHint    int64                  `json:"file_size_hint,omitempty"`
	Status          TaskState              `json:"status"`
	CreatedAt       time.Time              `json:"created_at"`
	UpdatedAt       time.Time              `json:"updated_at"`
	DownloadedBytes int64                  `json:"downloaded_bytes"`
	TotalBytes      int64                  `json:"total_bytes"`
	ProgressPercent int                    `json:"progress_percent"`
	ErrorMessage    string                 `json:"error_message,omitempty"`
	ErrorCategory   string                 `json:"error_category,omitempty"` // content_error, network, resource
	OutputURLs      []OutputURL            `json:"output_urls,omitempty"`
}

// OutputURL represents a delivered file location
type OutputURL struct {
	Type      string `json:"type"` // telegram, s3, local
	URL       string `json:"url"`
	ExpiresAt string `json:"expires_at,omitempty"` // for signed URLs
}

// ChunkProgress tracks download progress for resumable downloads
type ChunkProgress struct {
	SessionID string
	ChunkID   int
	Offset    int64
	Size      int64
	Status    string
	WorkerID  string
	LastBeat  time.Time
}

// UnmarshalPayload unmarshals JSON safely with validation
func UnmarshalPayload(data []byte) (*TaskPayload, error) {
	var p TaskPayload
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
