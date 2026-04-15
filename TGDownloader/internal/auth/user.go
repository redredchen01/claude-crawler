package auth

import (
	"fmt"
	"regexp"
	"time"

	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"gorm.io/gorm"
)

const (
	// UsernameMinLen is minimum username length
	UsernameMinLen = 3
	// UsernameMaxLen is maximum username length
	UsernameMaxLen = 32
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

// UserManager handles user CRUD operations
type UserManager struct {
	db *gorm.DB
}

// NewUserManager creates a new user manager
func NewUserManager(database *gorm.DB) *UserManager {
	return &UserManager{db: database}
}

// ValidateUsername checks if username meets requirements
func ValidateUsername(username string) error {
	if len(username) < UsernameMinLen || len(username) > UsernameMaxLen {
		return fmt.Errorf("username must be between %d and %d characters", UsernameMinLen, UsernameMaxLen)
	}
	if !usernameRegex.MatchString(username) {
		return fmt.Errorf("username can only contain letters, numbers, and underscores")
	}
	return nil
}

// CreateUser creates a new user
func (um *UserManager) CreateUser(username string) (*db.User, error) {
	if err := ValidateUsername(username); err != nil {
		return nil, err
	}

	user := &db.User{
		Username: username,
		IsActive: true,
	}

	if err := um.db.Create(user).Error; err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

// GetUser retrieves a user by ID
func (um *UserManager) GetUser(userID int64) (*db.User, error) {
	var user db.User
	if err := um.db.Where("id = ? AND deleted_at IS NULL", userID).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return &user, nil
}

// GetUserByUsername retrieves a user by username
func (um *UserManager) GetUserByUsername(username string) (*db.User, error) {
	var user db.User
	if err := um.db.Where("username = ? AND deleted_at IS NULL", username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return &user, nil
}

// ListUsers returns all active users
func (um *UserManager) ListUsers() ([]db.User, error) {
	var users []db.User
	if err := um.db.Where("deleted_at IS NULL").Order("created_at DESC").Find(&users).Error; err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	return users, nil
}

// UpdateUser updates user fields
func (um *UserManager) UpdateUser(user *db.User) error {
	if err := um.db.Save(user).Error; err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

// DeactivateUser soft-deletes a user
func (um *UserManager) DeactivateUser(userID int64) error {
	now := time.Now()
	if err := um.db.Model(&db.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"is_active": false,
		"deleted_at": now,
	}).Error; err != nil {
		return fmt.Errorf("failed to deactivate user: %w", err)
	}
	return nil
}

// KeyManager handles API key operations
type KeyManager struct {
	db *gorm.DB
}

// NewKeyManager creates a new key manager
func NewKeyManager(database *gorm.DB) *KeyManager {
	return &KeyManager{db: database}
}

// CreateKey generates and stores a new API key for a user with given type
// Default type is "api" if not specified
func (km *KeyManager) CreateKey(userID int64, name string) (key string, err error) {
	return km.CreateKeyWithType(userID, name, db.KeyTypeAPI)
}

// CreateKeyWithType generates and stores a new API key with specified type
func (km *KeyManager) CreateKeyWithType(userID int64, name string, keyType db.KeyType) (key string, err error) {
	// Verify user exists and is active
	user, err := NewUserManager(km.db).GetUser(userID)
	if err != nil {
		return "", err
	}
	if !user.IsValid() {
		return "", fmt.Errorf("user is not active")
	}

	// Validate key type
	if keyType != db.KeyTypeAPI && keyType != db.KeyTypeWebhook {
		return "", fmt.Errorf("invalid key type: %s (must be 'api' or 'webhook')", keyType)
	}

	// Generate key
	key, err = GenerateKey()
	if err != nil {
		return "", err
	}

	// Hash key
	hash, err := HashKey(key)
	if err != nil {
		return "", err
	}

	// Store in database
	apiKey := &db.APIKey{
		UserID:  userID,
		Name:    name,
		KeyHash: hash,
		KeyType: string(keyType),
	}

	if err := km.db.Create(apiKey).Error; err != nil {
		return "", fmt.Errorf("failed to store key: %w", err)
	}

	return key, nil
}

// ValidateKey verifies a key and returns the associated user ID if valid
// Deprecated: use ValidateKeyWithType instead for type-aware validation
func (km *KeyManager) ValidateKey(key string) (int64, error) {
	userID, _, _, err := km.ValidateKeyWithType(key)
	return userID, err
}

// ValidateKeyWithType verifies a key and returns user ID, key ID, and key type if valid
func (km *KeyManager) ValidateKeyWithType(key string) (userID, keyID int64, keyType db.KeyType, err error) {
	if key == "" {
		return 0, 0, "", fmt.Errorf("key is empty")
	}

	// Fetch all valid keys and verify (linear search, could be optimized with deterministic hash index in production)
	var apiKeys []db.APIKey
	if err := km.db.Where("is_revoked = ?", false).Find(&apiKeys).Error; err != nil {
		return 0, 0, "", fmt.Errorf("failed to fetch keys: %w", err)
	}

	for _, ak := range apiKeys {
		if !ak.IsValid() || !ak.IsValidType() {
			continue
		}

		if VerifyKey(key, ak.KeyHash) {
			// Update last used
			now := time.Now()
			ak.LastUsedAt = &now
			_ = km.db.Model(&ak).Update("last_used_at", now).Error

			// Verify user is still active
			user, err := NewUserManager(km.db).GetUser(ak.UserID)
			if err != nil || !user.IsValid() {
				return 0, 0, "", fmt.Errorf("user is not active")
			}

			return ak.UserID, ak.ID, db.KeyType(ak.KeyType), nil
		}
	}

	return 0, 0, "", fmt.Errorf("invalid key")
}

// GetKey retrieves a key by ID
func (km *KeyManager) GetKey(keyID int64) (*db.APIKey, error) {
	var apiKey db.APIKey
	if err := km.db.Where("id = ?", keyID).First(&apiKey).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("key not found")
		}
		return nil, fmt.Errorf("failed to get key: %w", err)
	}
	return &apiKey, nil
}

// ListUserKeys returns all non-revoked keys for a user
func (km *KeyManager) ListUserKeys(userID int64) ([]db.APIKey, error) {
	var keys []db.APIKey
	if err := km.db.Where("user_id = ? AND is_revoked = ?", userID, false).
		Order("created_at DESC").
		Find(&keys).Error; err != nil {
		return nil, fmt.Errorf("failed to list keys: %w", err)
	}
	return keys, nil
}

// RevokeKey marks a key as revoked
func (km *KeyManager) RevokeKey(keyID int64) error {
	if err := km.db.Model(&db.APIKey{}).Where("id = ?", keyID).Update("is_revoked", true).Error; err != nil {
		return fmt.Errorf("failed to revoke key: %w", err)
	}
	return nil
}

// RotateKey revokes an old key and generates a new one
func (km *KeyManager) RotateKey(keyID int64, newName string) (key string, err error) {
	oldKey, err := km.GetKey(keyID)
	if err != nil {
		return "", err
	}

	// Revoke old key
	if err := km.RevokeKey(keyID); err != nil {
		return "", err
	}

	// Create new key
	return km.CreateKey(oldKey.UserID, newName)
}
