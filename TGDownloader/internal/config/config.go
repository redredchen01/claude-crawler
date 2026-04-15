package config

import (
	"os"
	"strconv"
)

// Config holds all application configuration
type Config struct {
	RedisURL             string
	DatabaseURL          string
	ListenAddr           string
	TelegramToken        string
	MaxFFmpegProcs       int
	S3Endpoint           string
	S3Region             string
	S3Bucket             string
	AOFEnabled           bool
	LogLevel             string
	TDLibConfig          *TDLibConfig
	BotAPIConfig         *BotAPIConfig
	NotifyTelegramChatID string
	SMTPHost             string
	SMTPPort             string
	SMTPUser             string
	SMTPPass             string
	NotifyEmail          string
}

// Load reads configuration from environment variables
func Load() *Config {
	maxProcs := 2
	if mp := os.Getenv("MAX_FFMPEG_PROCS"); mp != "" {
		if n, err := strconv.Atoi(mp); err == nil && n > 0 {
			maxProcs = n
		}
	}

	aof := true
	if aofEnv := os.Getenv("AOF_ENABLED"); aofEnv != "" {
		aof = aofEnv == "true"
	}

	botAPIConfig := DefaultBotAPIConfig()
	if modeEnv := os.Getenv("BOT_API_MODE"); modeEnv != "" {
		if BotAPIMode(modeEnv) == BotAPIModeLocal || BotAPIMode(modeEnv) == BotAPIModeCloud {
			botAPIConfig.Mode = BotAPIMode(modeEnv)
		}
	}
	if urlEnv := os.Getenv("BOT_API_LOCAL_URL"); urlEnv != "" {
		botAPIConfig.LocalURL = urlEnv
	}

	return &Config{
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost/tgdownloader?sslmode=disable"),
		ListenAddr:           getEnv("LISTEN_ADDR", ":8080"),
		TelegramToken:        getEnv("TELEGRAM_BOT_TOKEN", ""),
		MaxFFmpegProcs:       maxProcs,
		S3Endpoint:           getEnv("S3_ENDPOINT", ""),
		S3Region:             getEnv("S3_REGION", "us-east-1"),
		S3Bucket:             getEnv("S3_BUCKET", "tgdownloader"),
		AOFEnabled:           aof,
		LogLevel:             getEnv("LOG_LEVEL", "info"),
		TDLibConfig:          LoadTDLibConfig(),
		BotAPIConfig:         botAPIConfig,
		NotifyTelegramChatID: getEnv("TELEGRAM_NOTIFY_CHAT_ID", ""),
		SMTPHost:             getEnv("SMTP_HOST", ""),
		SMTPPort:             getEnv("SMTP_PORT", "587"),
		SMTPUser:             getEnv("SMTP_USER", ""),
		SMTPPass:             getEnv("SMTP_PASS", ""),
		NotifyEmail:          getEnv("NOTIFY_EMAIL", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
