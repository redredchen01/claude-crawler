package auth

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGenerateKey(t *testing.T) {
	// Test basic generation
	key1, err := GenerateKey()
	assert.NoError(t, err)
	assert.NotEmpty(t, key1)
	assert.Equal(t, KeyLength*2, len(key1)) // Hex encoded is 2x the byte length

	// Test that keys are different (randomness)
	key2, err := GenerateKey()
	assert.NoError(t, err)
	assert.NotEqual(t, key1, key2, "generated keys should be different due to randomness")

	// Test multiple generations
	keys := make(map[string]bool)
	for i := 0; i < 100; i++ {
		k, err := GenerateKey()
		assert.NoError(t, err)
		assert.False(t, keys[k], "duplicate key generated at iteration %d", i)
		keys[k] = true
	}
}

func TestHashKey(t *testing.T) {
	key, err := GenerateKey()
	assert.NoError(t, err)

	// Test basic hashing
	hash, err := HashKey(key)
	assert.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, key, hash, "hash should differ from plaintext")

	// Test hash is bcrypt format (starts with $2a$ or $2b$ or $2y$)
	assert.True(t, strings.HasPrefix(hash, "$2"), "hash should be bcrypt format")

	// Test that same key produces different hashes (bcrypt includes salt)
	hash2, err := HashKey(key)
	assert.NoError(t, err)
	assert.NotEqual(t, hash, hash2, "bcrypt hashes should differ due to random salt")

	// But both should verify
	assert.True(t, VerifyKey(key, hash))
	assert.True(t, VerifyKey(key, hash2))
}

func TestVerifyKey(t *testing.T) {
	key, err := GenerateKey()
	assert.NoError(t, err)

	hash, err := HashKey(key)
	assert.NoError(t, err)

	// Test valid key verification
	assert.True(t, VerifyKey(key, hash), "correct key should verify")

	// Test invalid key verification
	otherKey, err := GenerateKey()
	assert.NoError(t, err)
	assert.False(t, VerifyKey(otherKey, hash), "incorrect key should not verify")

	// Test empty key
	assert.False(t, VerifyKey("", hash), "empty key should not verify")

	// Test corrupted hash
	assert.False(t, VerifyKey(key, "invalid"), "corrupted hash should not verify")
}

func TestHashingConsistency(t *testing.T) {
	// Generate a key
	key, err := GenerateKey()
	assert.NoError(t, err)

	// Hash it multiple times and verify all match
	hashes := make([]string, 5)
	for i := 0; i < 5; i++ {
		h, err := HashKey(key)
		assert.NoError(t, err)
		hashes[i] = h
	}

	// All hashes should verify against the same key
	for i, hash := range hashes {
		assert.True(t, VerifyKey(key, hash), "hash at index %d should verify", i)
	}
}

func TestKeyMaxLength(t *testing.T) {
	// Test that we can hash keys up to bcrypt's 72-byte limit
	// Bcrypt has a 72-byte limit, so test with a 72-byte key
	longKey := strings.Repeat("a", 72)
	hash, err := HashKey(longKey)
	assert.NoError(t, err)
	assert.True(t, VerifyKey(longKey, hash))

	// Keys longer than 72 bytes should fail
	tooLongKey := strings.Repeat("a", 73)
	_, err = HashKey(tooLongKey)
	assert.Error(t, err, "keys longer than 72 bytes should fail with bcrypt")
}
