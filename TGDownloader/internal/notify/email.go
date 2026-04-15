package notify

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"

	"go.uber.org/zap"
)

// EmailNotifier sends notifications via SMTP
type EmailNotifier struct {
	host     string
	port     string
	user     string
	pass     string
	to       string
	logger   *zap.Logger
}

// NewEmailNotifier creates a new Email notifier
func NewEmailNotifier(cfg *Config, logger *zap.Logger) *EmailNotifier {
	port := cfg.SMTPPort
	if port == "" {
		port = "587" // Default TLS port
	}

	return &EmailNotifier{
		host:   cfg.SMTPHost,
		port:   port,
		user:   cfg.SMTPUser,
		pass:   cfg.SMTPPass,
		to:     cfg.NotifyEmail,
		logger: logger,
	}
}

// Notify sends a download completion notification via Email
func (n *EmailNotifier) Notify(ctx context.Context, taskID string, userID int64, fileURL string, sizeBytes int64) error {
	// Build address
	addr := n.host + ":" + n.port

	// Truncate URL if too long for display
	urlDisplay := fileURL
	if len(urlDisplay) > 80 {
		urlDisplay = urlDisplay[:77] + "..."
	}

	// Build email body
	body := fmt.Sprintf(
		"Subject: TGDownloader: Download Complete\r\n"+
			"From: %s\r\n"+
			"To: %s\r\n"+
			"Content-Type: text/plain; charset=utf-8\r\n"+
			"\r\n"+
			"Download Complete\r\n"+
			"=================\r\n\n"+
			"Task ID: %s\r\n"+
			"URL: %s\r\n"+
			"Size: %s\r\n"+
			"User ID: %d\r\n"+
			"\r\n"+
			"Your download has completed successfully.\r\n",
		n.user,
		n.to,
		taskID[:8], // First 8 chars of UUID
		urlDisplay,
		formatBytes(sizeBytes),
		userID,
	)

	// Send email
	auth := smtp.PlainAuth("", n.user, n.pass, n.host)
	to := strings.Split(n.to, ";")

	err := smtp.SendMail(addr, auth, n.user, to, []byte(body))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	n.logger.Debug("Email notification sent",
		zap.String("task_id", taskID),
		zap.String("to", n.to),
	)

	return nil
}
