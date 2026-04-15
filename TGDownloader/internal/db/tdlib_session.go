package db

import "time"

// TDLibSession stores encrypted TDLib credentials for a user
type TDLibSession struct {
	ID                   int64     `gorm:"primaryKey"`
	UserID               int64     `gorm:"index;uniqueIndex;not null"` // One active session per user
	EncryptedAPIID       string    `gorm:"type:text;not null"`         // AES-256-GCM encrypted
	EncryptedAPIHash     string    `gorm:"type:text;not null"`         // AES-256-GCM encrypted
	EncryptedPhone       string    `gorm:"type:text;not null"`         // AES-256-GCM encrypted
	SessionFile          string    `gorm:"type:varchar(255);nullable"` // Optional path to TDLib session file
	CreatedAt            time.Time `gorm:"index"`
	UpdatedAt            time.Time
	LastAuthenticatedAt  *time.Time `gorm:"nullable;index"` // When the session was last verified
	Active               bool       `gorm:"default:true;index"`

	// Relation
	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

// TableName specifies table name for TDLibSession
func (TDLibSession) TableName() string {
	return "tdlib_sessions"
}

// PlaintextCredentials holds decrypted credentials (never stored in DB)
type PlaintextCredentials struct {
	APIID   string
	APIHash string
	Phone   string
}

// Decrypt returns the plaintext credentials. Caller must decrypt using the encryption key.
// This is a placeholder - actual decryption happens in the session manager.
// DO NOT LOG OR PRINT this struct.
func (ts *TDLibSession) PlaintextFields() *PlaintextCredentials {
	// This is a safety marker - actual decryption happens in user_session.go
	return nil
}

// IsValid checks if session is active
func (ts *TDLibSession) IsValid() bool {
	return ts.Active
}

// UpdateLastAuthenticated updates the last_authenticated_at timestamp
func (ts *TDLibSession) UpdateLastAuthenticated() {
	now := time.Now()
	ts.LastAuthenticatedAt = &now
	ts.UpdatedAt = now
}
