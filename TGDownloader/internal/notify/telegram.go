package notify

import (
	"context"
	"fmt"
	"strconv"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"go.uber.org/zap"
)

// TelegramNotifier sends notifications via Telegram Bot API
type TelegramNotifier struct {
	bot    *tgbotapi.BotAPI
	chatID int64
	logger *zap.Logger
}

// NewTelegramNotifier creates a new Telegram notifier
func NewTelegramNotifier(token string, chatIDStr string, logger *zap.Logger) (*TelegramNotifier, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Telegram bot: %w", err)
	}

	chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid chat_id: %w", err)
	}

	return &TelegramNotifier{
		bot:    bot,
		chatID: chatID,
		logger: logger,
	}, nil
}

// Notify sends a download completion notification via Telegram
func (n *TelegramNotifier) Notify(ctx context.Context, taskID string, userID int64, fileURL string, sizeBytes int64) error {
	// Format file size
	sizeStr := formatBytes(sizeBytes)

	// Truncate URL if too long
	urlDisplay := fileURL
	if len(urlDisplay) > 60 {
		urlDisplay = urlDisplay[:57] + "..."
	}

	// Create message
	message := fmt.Sprintf(
		"✅ 下載完成\n\n📎 連結: %s\n💾 大小: %s\n🆔 任務: %s",
		urlDisplay,
		sizeStr,
		taskID[:8], // Show first 8 chars of UUID
	)

	msg := tgbotapi.NewMessage(n.chatID, message)
	msg.ParseMode = tgbotapi.ModeMarkdown

	_, err := n.bot.Send(msg)
	if err != nil {
		return fmt.Errorf("failed to send Telegram message: %w", err)
	}

	n.logger.Debug("Telegram notification sent",
		zap.String("task_id", taskID),
		zap.Int64("chat_id", n.chatID),
	)

	return nil
}

// formatBytes converts bytes to a human-readable string
func formatBytes(bytes int64) string {
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(bytes)

	for i, unit := range units {
		if size < 1024 {
			return fmt.Sprintf("%.2f %s", size, unit)
		}
		if i < len(units)-1 {
			size /= 1024
		}
	}
	return fmt.Sprintf("%.2f %s", size, units[len(units)-1])
}
