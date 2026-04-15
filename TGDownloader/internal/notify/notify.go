package notify

import (
	"context"

	"go.uber.org/zap"
)

// Notifier is the interface for sending notifications
type Notifier interface {
	Notify(ctx context.Context, taskID string, userID int64, fileURL string, sizeBytes int64) error
}

// Config holds notification configuration
type Config struct {
	TelegramBotToken     string
	TelegramNotifyChatID string
	SMTPHost             string
	SMTPPort             string
	SMTPUser             string
	SMTPPass             string
	NotifyEmail          string
}

// Manager manages multiple notifiers
type Manager struct {
	notifiers []Notifier
	logger    *zap.Logger
}

// NewManager creates a new notification manager
func NewManager(cfg *Config, logger *zap.Logger) *Manager {
	m := &Manager{
		notifiers: make([]Notifier, 0),
		logger:    logger,
	}

	// Add Telegram notifier if configured
	if cfg.TelegramBotToken != "" && cfg.TelegramNotifyChatID != "" {
		tgNotifier, err := NewTelegramNotifier(cfg.TelegramBotToken, cfg.TelegramNotifyChatID, logger)
		if err != nil {
			logger.Warn("failed to initialize Telegram notifier", zap.Error(err))
		} else {
			m.notifiers = append(m.notifiers, tgNotifier)
			logger.Info("Telegram notifier initialized")
		}
	}

	// Add Email notifier if configured
	if cfg.SMTPHost != "" && cfg.NotifyEmail != "" {
		emailNotifier := NewEmailNotifier(cfg, logger)
		m.notifiers = append(m.notifiers, emailNotifier)
		logger.Info("Email notifier initialized")
	}

	return m
}

// NotifyCompletion sends notifications to all configured channels
// Errors are logged but do not fail the operation (graceful degradation)
func (m *Manager) NotifyCompletion(ctx context.Context, taskID string, userID int64, fileURL string, sizeBytes int64) {
	for _, notifier := range m.notifiers {
		go func(n Notifier) {
			if err := n.Notify(ctx, taskID, userID, fileURL, sizeBytes); err != nil {
				m.logger.Warn("notification send failed",
					zap.String("task_id", taskID),
					zap.Error(err),
				)
			}
		}(notifier)
	}
}
