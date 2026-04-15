package config

// BotAPIMode represents the Bot API server mode
type BotAPIMode string

const (
	BotAPIModeCloud BotAPIMode = "cloud"
	BotAPIModeLocal BotAPIMode = "local"
)

// BotAPIConfig holds Bot API Server configuration
type BotAPIConfig struct {
	Mode     BotAPIMode
	LocalURL string
	// File size thresholds (bytes)
	ThresholdSmall  int64 // Use cloud API if file <= this
	ThresholdLarge  int64 // Use local API if file <= this, fallback to S3 if > this
	MaxRetries      int   // Max retries for rate limit
	RetryBaseWaitMS int   // Base wait time for exponential backoff (ms)
}

// DefaultBotAPIConfig returns default configuration
func DefaultBotAPIConfig() *BotAPIConfig {
	return &BotAPIConfig{
		Mode:            BotAPIModeCloud,
		LocalURL:        "http://localhost:8081",
		ThresholdSmall:  50 * 1024 * 1024,     // 50 MB
		ThresholdLarge:  2 * 1024 * 1024 * 1024, // 2 GB
		MaxRetries:      3,
		RetryBaseWaitMS: 1000, // 1 second
	}
}
