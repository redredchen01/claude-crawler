package db

import (
	"time"

	"gorm.io/gorm"
)

// DownloadSession represents a download task session
type DownloadSession struct {
	SessionID      string    `gorm:"primaryKey;type:varchar(36)"`
	UserID         int64     `gorm:"index;default:0"`
	FileURL        string    `gorm:"type:text;index"`
	SourceType     string    `gorm:"type:varchar(50);index"`
	Status         string    `gorm:"type:varchar(50);index"`
	CreatedAt      time.Time `gorm:"index"`
	UpdatedAt      time.Time
	CompletedAt    *time.Time
	ClaimedBy      *string `gorm:"nullable"`
	LastHeartbeat  time.Time
	FileSizeHint   int64
	TotalSizeBytes int64
	SHA256         string `gorm:"nullable;index"`
	OutputURLs     string `gorm:"type:jsonb;default:'[]'"`
	ErrorMessage   string `gorm:"nullable"`
	ErrorCategory  string `gorm:"nullable"`
}

// ChunkProgress tracks chunk-level download progress
type ChunkProgress struct {
	ID         int64  `gorm:"primaryKey"`
	SessionID  string `gorm:"type:varchar(36);index:,unique,composite:session_chunk_idx"`
	ChunkID    int    `gorm:"index:,unique,composite:session_chunk_idx"`
	OffsetByte int64
	ChunkSize  int64
	Status     string `gorm:"type:varchar(50)"` // pending, downloading, verified, done
	WorkerID   string `gorm:"nullable"`
	LastBeat   time.Time
	RetryCount int
}

// TaskResult represents the final result of a download task
type TaskResult struct {
	SessionID    string `gorm:"primaryKey;type:varchar(36)"`
	Status       string `gorm:"type:varchar(50)"`
	OutputURLs   string `gorm:"type:jsonb;default:'[]'"`
	ErrorMessage string `gorm:"nullable"`
	ErrorType    string `gorm:"nullable"`
	CompletedAt  *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TableName specifies table name for DownloadSession
func (DownloadSession) TableName() string {
	return "download_sessions"
}

// TableName specifies table name for ChunkProgress
func (ChunkProgress) TableName() string {
	return "chunk_progress"
}

// TableName specifies table name for TaskResult
func (TaskResult) TableName() string {
	return "task_results"
}

// TaskMetadata stores extracted metadata for downloaded files
type TaskMetadata struct {
	ID           int64      `gorm:"primaryKey"`
	TaskID       string     `gorm:"type:varchar(36);index:,unique,composite:task_user_idx"`
	UserID       string     `gorm:"type:varchar(36);index:,unique,composite:task_user_idx"`
	DurationMs   *int64     `gorm:"nullable"` // Video/audio duration in milliseconds
	VideoCodec   *string    `gorm:"nullable"` // e.g., h264, vp9, av1
	AudioCodec   *string    `gorm:"nullable"` // e.g., aac, opus, mp3
	Width        *int64     `gorm:"nullable"` // Image/video width in pixels
	Height       *int64     `gorm:"nullable"` // Image/video height in pixels
	BitRate      *int64     `gorm:"nullable"` // Bit rate in bits per second
	ContainerFmt *string    `gorm:"nullable"` // e.g., mp4, webm, mp3
	ThumbnailURL *string    `gorm:"nullable"` // S3 URL to thumbnail
	CreatedAt    time.Time  `gorm:"index"`
}

// TableName specifies table name for TaskMetadata
func (TaskMetadata) TableName() string {
	return "task_metadata"
}

// InitDB applies all migrations
func InitDB(db *gorm.DB) error {
	models := []interface{}{
		&DownloadSession{},
		&ChunkProgress{},
		&TaskResult{},
		&FileMetadata{},
		&User{},
		&APIKey{}, // Must migrate before RateLimit (FK dependency)
		&RateLimit{},
		&Quota{},
		&TDLibSession{},
		&TaskMetadata{},
		&Webhook{}, // Must migrate before WebhookDelivery (FK dependency)
		&WebhookDelivery{},
		&Credit{},           // Must migrate before CreditTransaction (FK dependency)
		&CreditTransaction{},
		&BillingConfig{},
	}
	return db.AutoMigrate(models...)
}
