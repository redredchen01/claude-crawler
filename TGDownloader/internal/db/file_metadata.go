package db

import (
	"time"
)

// FileMetadata tracks deduplicated file cache entries
type FileMetadata struct {
	ID           int64      `gorm:"primaryKey"`
	UserID       int64      `gorm:"index:,unique,composite:user_hash_idx;not null"` // For user-scoped dedup
	UniqueID     string     `gorm:"type:varchar(64);index:,unique,composite:user_hash_idx;not null"` // SHA256 hash
	SourceType   string     `gorm:"type:varchar(50);not null;index"`       // http, yt_dlp, telegram
	CachePath    string     `gorm:"type:text;not null"`                    // Full path to cached file
	ContentSize  int64      `gorm:"not null"`                              // File size in bytes
	CreatedAt    time.Time  `gorm:"index"`
	LastAccessAt *time.Time `gorm:"nullable;index"`
	DeletedAt    *time.Time `gorm:"nullable;index"` // Soft delete with 7-day grace period
}

// TableName specifies table name for FileMetadata
func (FileMetadata) TableName() string {
	return "file_metadata"
}

// IsValid checks if the cached file is still valid for reuse
func (fm *FileMetadata) IsValid() bool {
	return fm.DeletedAt == nil
}

// MarkDeleted soft-deletes the entry with grace period
func (fm *FileMetadata) MarkDeleted() {
	now := time.Now()
	fm.DeletedAt = &now
}

// UpdateLastAccess updates the last access timestamp
func (fm *FileMetadata) UpdateLastAccess() {
	now := time.Now()
	fm.LastAccessAt = &now
}
