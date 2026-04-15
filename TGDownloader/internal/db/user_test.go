package db

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

var (
	zeroTime = time.Now()
	nullTime = time.Time{}
)

func TestUserIsValid(t *testing.T) {
	tests := []struct {
		name     string
		user     *User
		expected bool
	}{
		{
			name:     "active user",
			user:     &User{IsActive: true, DeletedAt: nil},
			expected: true,
		},
		{
			name:     "inactive user",
			user:     &User{IsActive: false, DeletedAt: nil},
			expected: false,
		},
		{
			name:     "deleted user",
			user:     &User{IsActive: true, DeletedAt: &nullTime},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.user.IsValid())
		})
	}
}

func TestAPIKeyIsValid(t *testing.T) {
	pastTime := zeroTime.Add(-time.Hour)
	futureTime := zeroTime.Add(time.Hour)

	tests := []struct {
		name     string
		key      *APIKey
		expected bool
	}{
		{
			name:     "valid key",
			key:      &APIKey{IsRevoked: false, ExpiresAt: nil},
			expected: true,
		},
		{
			name:     "revoked key",
			key:      &APIKey{IsRevoked: true, ExpiresAt: nil},
			expected: false,
		},
		{
			name:     "expired key",
			key:      &APIKey{IsRevoked: false, ExpiresAt: &pastTime},
			expected: false,
		},
		{
			name:     "valid with future expiration",
			key:      &APIKey{IsRevoked: false, ExpiresAt: &futureTime},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.key.IsValid())
		})
	}
}

func TestAPIKeyUpdateLastUsed(t *testing.T) {
	key := &APIKey{
		LastUsedAt: nil,
	}

	key.UpdateLastUsed()

	assert.NotNil(t, key.LastUsedAt)
}
