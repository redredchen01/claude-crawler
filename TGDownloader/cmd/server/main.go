package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/redredchen01/tgdownloader-v2/internal/api"
	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/dedup"
	"github.com/redredchen01/tgdownloader-v2/internal/notify"
	"github.com/redredchen01/tgdownloader-v2/internal/queue"
	"github.com/redredchen01/tgdownloader-v2/internal/shutdown"
	"github.com/redredchen01/tgdownloader-v2/internal/worker"
)

// chainMiddleware applies a middleware to a handler function
func chainMiddleware(middleware func(http.Handler) http.Handler, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		middleware(handler).ServeHTTP(w, r)
	}
}

// newNotifyManager creates and returns a notification manager if configured
func newNotifyManager(cfg *config.Config, logger *zap.Logger) *notify.Manager {
	notifyCfg := &notify.Config{
		TelegramBotToken:     cfg.TelegramToken,
		TelegramNotifyChatID: cfg.NotifyTelegramChatID,
		SMTPHost:             cfg.SMTPHost,
		SMTPPort:             cfg.SMTPPort,
		SMTPUser:             cfg.SMTPUser,
		SMTPPass:             cfg.SMTPPass,
		NotifyEmail:          cfg.NotifyEmail,
	}

	// Only create manager if at least one notification channel is configured
	if (cfg.TelegramToken != "" && cfg.NotifyTelegramChatID != "") ||
		(cfg.SMTPHost != "" && cfg.NotifyEmail != "") {
		return notify.NewManager(notifyCfg, logger)
	}

	return nil
}

func main() {
	cfg := config.Load()

	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()

	logger.Info("TGDownloader v2 starting",
		zap.String("listen_addr", cfg.ListenAddr),
		zap.String("log_level", cfg.LogLevel),
	)

	// Initialize database
	dbConn, err := initDatabase(cfg.DatabaseURL, logger)
	if err != nil {
		logger.Fatal("Failed to initialize database", zap.Error(err))
	}

	// Initialize Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	if _, err := redisClient.Ping(context.Background()).Result(); err != nil {
		logger.Fatal("Failed to connect to Redis", zap.Error(err))
	}

	// Initialize dedup manager
	dedupCfg := &dedup.Config{
		CacheDir:        "/data/cache",
		CleanupInterval: 1 * time.Hour,
		GracePeriod:     7 * 24 * time.Hour,
	}
	dedupMgr := dedup.NewManager(dbConn, logger, dedupCfg)
	defer dedupMgr.Stop(context.Background())

	// Initialize broker and worker pool
	broker := queue.NewBroker(redisClient, logger)
	workerPool := queue.NewWorkerPool(8, broker, logger) // Default 8 workers

	// Register task handlers
	downloadWorker := worker.NewDownloadWorker(dbConn, logger)
	downloadWorker.SetDedupManager(dedupMgr, true)
	telegramWorker := worker.NewTelegramDownloadWorker(dbConn, logger)
	telegramWorker.SetDedupManager(dedupMgr, true)

	// Initialize notification manager (optional, depends on config)
	notifyMgr := newNotifyManager(cfg, logger)
	if notifyMgr != nil {
		downloadWorker.SetNotifier(notifyMgr)
		telegramWorker.SetNotifier(notifyMgr)
	}

	workerPool.RegisterHandler("http", downloadWorker.Process)
	workerPool.RegisterHandler("telegram", telegramWorker.Process)

	workerPool.Start()

	// Create HTTP router
	router := http.NewServeMux()

	// Initialize API handler
	apiHandler := api.NewHandler(dbConn, redisClient, logger)
	// TODO: Pass dedupMgr to workers when they are instantiated in apiHandler

	// Initialize dashboard handler
	dashboardHandler := api.NewDashboardHandler(dbConn, redisClient, logger)

	// Initialize admin handler
	adminHandler := api.NewAdminHandler(dbConn, logger)

	// Create auth middleware for API routes
	authMiddleware := api.AuthMiddleware(dbConn, logger)

	// Create admin auth middleware
	adminAuthMiddleware := api.AdminAuthMiddleware(logger)

	// Register API endpoints with auth middleware
	router.HandleFunc("POST /tasks", chainMiddleware(authMiddleware, apiHandler.SubmitTask))
	router.HandleFunc("GET /tasks", chainMiddleware(authMiddleware, apiHandler.ListTasks))
	router.HandleFunc("GET /tasks/{id}", chainMiddleware(authMiddleware, apiHandler.GetTaskStatus))

	// Register Telegram authentication endpoints with auth middleware
	router.HandleFunc("POST /auth/telegram/phone", chainMiddleware(authMiddleware, apiHandler.InitPhoneAuth))
	router.HandleFunc("POST /auth/telegram/verify", chainMiddleware(authMiddleware, apiHandler.VerifyPhoneCode))
	router.HandleFunc("GET /auth/telegram/status", chainMiddleware(authMiddleware, apiHandler.GetAuthStatus))

	// Register file operations endpoints with auth middleware
	router.HandleFunc("POST /open-file", chainMiddleware(authMiddleware, apiHandler.OpenFile))

	// Health check is public (no auth required)
	router.HandleFunc("GET /health", apiHandler.HealthCheck)

	// First-time setup endpoint (public)
	router.HandleFunc("POST /setup/quick-key", adminHandler.QuickSetupKey)
	router.HandleFunc("GET /setup/status", adminHandler.GetSetupStatus)

	// Register dashboard endpoints
	router.HandleFunc("GET /metrics", dashboardHandler.GetMetrics)
	router.HandleFunc("GET /metrics/errors", dashboardHandler.GetErrors)

	// Register admin endpoints with admin auth middleware
	router.HandleFunc("POST /admin/users", chainMiddleware(adminAuthMiddleware, adminHandler.CreateUser))
	router.HandleFunc("POST /admin/keys/{user_id}", chainMiddleware(adminAuthMiddleware, adminHandler.GenerateKey))
	router.HandleFunc("PATCH /admin/quotas/{user_id}", chainMiddleware(adminAuthMiddleware, adminHandler.AdjustQuota))
	router.HandleFunc("GET /admin/analytics/{user_id}", chainMiddleware(adminAuthMiddleware, adminHandler.GetAnalytics))
	router.HandleFunc("GET /admin/analytics", chainMiddleware(adminAuthMiddleware, adminHandler.GetSystemAnalytics))
	router.HandleFunc("DELETE /admin/users/{user_id}", chainMiddleware(adminAuthMiddleware, adminHandler.DeleteUser))

	// Register billing endpoints with admin auth middleware
	router.HandleFunc("GET /admin/billing/{user_id}", chainMiddleware(adminAuthMiddleware, adminHandler.GetBilling))
	router.HandleFunc("GET /admin/billing/{user_id}/transactions", chainMiddleware(adminAuthMiddleware, adminHandler.GetBillingTransactions))
	router.HandleFunc("POST /admin/billing/{user_id}/add-credits", chainMiddleware(adminAuthMiddleware, adminHandler.AddCredits))
	router.HandleFunc("GET /admin/billing", chainMiddleware(adminAuthMiddleware, adminHandler.GetAggregatedBilling))
	router.HandleFunc("POST /admin/billing/config", chainMiddleware(adminAuthMiddleware, adminHandler.UpdateBillingConfig))

	// Mount web directory for static files
	router.Handle("GET /dashboard", http.FileServer(http.Dir("./web")))
	router.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/app.html")
	})
	router.HandleFunc("GET /app.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/app.html")
	})
	router.Handle("GET /", http.FileServer(http.Dir("./web")))
	// Serve static assets
	router.Handle("GET /style.css", http.FileServer(http.Dir("./web")))
	router.Handle("GET /dashboard.js", http.FileServer(http.Dir("./web")))

	// Start webhook delivery processor background goroutine
	// This processes pending webhook deliveries with retry logic
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			// ProcessDeliveries is safe to call repeatedly; it's idempotent
			// Webhook manager will be created lazily if webhooks are registered
		}
	}()

	// Start server
	server := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: router,
	}

	// Graceful shutdown - 60s timeout to accommodate long TDLib operations
	const shutdownTimeout = 60 * time.Second
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-sigChan
		logger.Info("shutdown signal received",
			zap.String("signal", sig.String()),
			zap.Duration("timeout", shutdownTimeout),
		)

		// Create shutdown coordinator
		shutdownCoord := shutdown.NewCoordinator(
			logger,
			server,
			workerPool,
			broker,
			dbConn,
			redisClient,
			shutdownTimeout,
		)

		// Execute shutdown sequence
		if err := shutdownCoord.Stop(); err != nil {
			logger.Warn("error during shutdown stop stage", zap.Error(err))
		}

		// Wait for workers with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := shutdownCoord.WaitForWorkers(shutdownCtx); err != nil {
			logger.Warn("workers did not exit gracefully", zap.Error(err))
		}

		// Close connections
		if err := shutdownCoord.Close(); err != nil {
			logger.Warn("error closing connections", zap.Error(err))
		}

		logger.Info("graceful shutdown complete, exiting")
		os.Exit(0)
	}()

	logger.Info("Server listening", zap.String("addr", cfg.ListenAddr))
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatal("Server failed", zap.Error(err))
	}
}

func initDatabase(dsn string, logger *zap.Logger) (*gorm.DB, error) {
	var dbConn *gorm.DB
	var err error

	// Detect database type from DSN
	if strings.HasPrefix(dsn, "file:") || strings.HasPrefix(dsn, "sqlite:") {
		// SQLite
		logger.Info("Using SQLite database", zap.String("dsn", dsn))
		dbConn, err = gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	} else {
		// PostgreSQL (default)
		logger.Info("Using PostgreSQL database")
		dbConn, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	}

	if err != nil {
		return nil, err
	}

	// Run migrations
	if err := db.InitDB(dbConn); err != nil {
		return nil, err
	}

	logger.Info("Database initialized successfully")
	return dbConn, nil
}
