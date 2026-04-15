package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

const (
	// KeyLength is the length of raw API keys in bytes
	KeyLength = 32
	// BcryptCost is the cost factor for bcrypt hashing
	BcryptCost = 12
)

// GenerateKey generates a new random API key (32 bytes)
func GenerateKey() (string, error) {
	bytes := make([]byte, KeyLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// HashKey returns the bcrypt hash of a key
func HashKey(key string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(key), BcryptCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash key: %w", err)
	}
	return string(hash), nil
}

// VerifyKey checks if a plaintext key matches the given hash
func VerifyKey(key, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(key)) == nil
}
