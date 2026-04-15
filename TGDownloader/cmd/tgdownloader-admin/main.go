package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/redredchen01/tgdownloader-v2/internal/auth"
	"github.com/redredchen01/tgdownloader-v2/internal/billing"
	"github.com/redredchen01/tgdownloader-v2/internal/config"
	"github.com/redredchen01/tgdownloader-v2/internal/db"
	"github.com/redredchen01/tgdownloader-v2/internal/tdlib"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	cfg := config.Load()
	dbConn, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run migrations
	if err := db.InitDB(dbConn); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	command := os.Args[1]

	switch command {
	case "user":
		handleUser(dbConn, os.Args[2:])
	case "key":
		handleKey(dbConn, os.Args[2:])
	case "billing":
		handleBilling(dbConn, os.Args[2:])
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		usage()
		os.Exit(1)
	}
}

func handleUser(dbConn *gorm.DB, args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "user subcommand required\n")
		userUsage()
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	subcommand := args[0]

	switch subcommand {
	case "create":
		handleUserCreate(um, args[1:])
	case "list":
		handleUserList(um)
	case "deactivate":
		handleUserDeactivate(um, args[1:])
	case "get":
		handleUserGet(um, args[1:])
	case "set-tdlib-creds":
		handleUserSetTDLibCreds(dbConn, args[1:])
	default:
		fmt.Fprintf(os.Stderr, "Unknown user subcommand: %s\n", subcommand)
		userUsage()
		os.Exit(1)
	}
}

func handleUserCreate(um *auth.UserManager, args []string) {
	fs := flag.NewFlagSet("user create", flag.ExitOnError)
	username := fs.String("username", "", "Username (required)")
	fs.Parse(args)

	if *username == "" {
		fmt.Fprintf(os.Stderr, "Error: --username is required\n")
		fs.Usage()
		os.Exit(1)
	}

	user, err := um.CreateUser(*username)
	if err != nil {
		log.Fatalf("Failed to create user: %v", err)
	}

	fmt.Printf("User created successfully\n")
	fmt.Printf("  ID: %d\n", user.ID)
	fmt.Printf("  Username: %s\n", user.Username)
	fmt.Printf("  Created at: %s\n", user.CreatedAt.Format("2006-01-02 15:04:05"))
}

func handleUserList(um *auth.UserManager) {
	users, err := um.ListUsers()
	if err != nil {
		log.Fatalf("Failed to list users: %v", err)
	}

	if len(users) == 0 {
		fmt.Println("No users found")
		return
	}

	fmt.Printf("%-5s %-32s %-19s\n", "ID", "Username", "Created At")
	fmt.Println("-------------------------------------------------------")
	for _, u := range users {
		fmt.Printf("%-5d %-32s %-19s\n", u.ID, u.Username, u.CreatedAt.Format("2006-01-02 15:04:05"))
	}
}

func handleUserGet(um *auth.UserManager, args []string) {
	fs := flag.NewFlagSet("user get", flag.ExitOnError)
	username := fs.String("username", "", "Username to retrieve")
	id := fs.Int64("id", 0, "User ID to retrieve")
	fs.Parse(args)

	var user *db.User
	var err error

	if *id != 0 {
		user, err = um.GetUser(*id)
	} else if *username != "" {
		user, err = um.GetUserByUsername(*username)
	} else {
		fmt.Fprintf(os.Stderr, "Error: --id or --username is required\n")
		fs.Usage()
		os.Exit(1)
	}

	if err != nil {
		log.Fatalf("Failed to get user: %v", err)
	}

	fmt.Printf("User Details\n")
	fmt.Printf("  ID: %d\n", user.ID)
	fmt.Printf("  Username: %s\n", user.Username)
	fmt.Printf("  Is Active: %v\n", user.IsActive)
	fmt.Printf("  Created At: %s\n", user.CreatedAt.Format("2006-01-02 15:04:05"))
	fmt.Printf("  Updated At: %s\n", user.UpdatedAt.Format("2006-01-02 15:04:05"))
}

func handleUserDeactivate(um *auth.UserManager, args []string) {
	fs := flag.NewFlagSet("user deactivate", flag.ExitOnError)
	id := fs.Int64("id", 0, "User ID (required)")
	fs.Parse(args)

	if *id == 0 {
		fmt.Fprintf(os.Stderr, "Error: --id is required\n")
		fs.Usage()
		os.Exit(1)
	}

	err := um.DeactivateUser(*id)
	if err != nil {
		log.Fatalf("Failed to deactivate user: %v", err)
	}

	fmt.Printf("User %d deactivated successfully\n", *id)
}

func handleKey(dbConn *gorm.DB, args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "key subcommand required\n")
		keyUsage()
		os.Exit(1)
	}

	km := auth.NewKeyManager(dbConn)
	subcommand := args[0]

	switch subcommand {
	case "generate":
		handleKeyGenerate(km, args[1:], dbConn)
	case "list":
		handleKeyList(km, args[1:])
	case "revoke":
		handleKeyRevoke(km, args[1:])
	case "rotate":
		handleKeyRotate(km, args[1:])
	default:
		fmt.Fprintf(os.Stderr, "Unknown key subcommand: %s\n", subcommand)
		keyUsage()
		os.Exit(1)
	}
}

func handleKeyGenerate(km *auth.KeyManager, args []string, dbConn *gorm.DB) {
	fs := flag.NewFlagSet("key generate", flag.ExitOnError)
	user := fs.String("user", "", "Username (required)")
	name := fs.String("name", "", "Key name (optional)")
	keyType := fs.String("type", "api", "Key type: 'api' or 'webhook' (optional, default: api)")
	fs.Parse(args)

	if *user == "" {
		fmt.Fprintf(os.Stderr, "Error: --user is required\n")
		fs.Usage()
		os.Exit(1)
	}

	// Validate key type
	keyTypeEnum := db.KeyType(*keyType)
	if keyTypeEnum != db.KeyTypeAPI && keyTypeEnum != db.KeyTypeWebhook {
		fmt.Fprintf(os.Stderr, "Error: --type must be 'api' or 'webhook', got '%s'\n", *keyType)
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*user)
	if err != nil {
		log.Fatalf("Failed to find user: %v", err)
	}

	key, err := km.CreateKeyWithType(userObj.ID, *name, keyTypeEnum)
	if err != nil {
		log.Fatalf("Failed to generate key: %v", err)
	}

	fmt.Printf("API key generated successfully\n")
	fmt.Printf("  User: %s (ID: %d)\n", *user, userObj.ID)
	fmt.Printf("  Type: %s\n", *keyType)
	if *name != "" {
		fmt.Printf("  Name: %s\n", *name)
	}
	fmt.Printf("  Key: %s\n", key)
	fmt.Printf("\nStore this key securely. You won't be able to see it again.\n")
}

func handleKeyList(km *auth.KeyManager, args []string) {
	fs := flag.NewFlagSet("key list", flag.ExitOnError)
	userID := fs.Int64("user-id", 0, "User ID (required)")
	fs.Parse(args)

	if *userID == 0 {
		fmt.Fprintf(os.Stderr, "Error: --user-id is required\n")
		fs.Usage()
		os.Exit(1)
	}

	keys, err := km.ListUserKeys(*userID)
	if err != nil {
		log.Fatalf("Failed to list keys: %v", err)
	}

	if len(keys) == 0 {
		fmt.Println("No active keys found for user")
		return
	}

	fmt.Printf("%-5s %-15s %-30s %-19s %-19s\n", "ID", "Type", "Name", "Created At", "Last Used At")
	fmt.Println("--------------------------------------------------------------------------------------------------")
	for _, k := range keys {
		lastUsed := "Never"
		if k.LastUsedAt != nil {
			lastUsed = k.LastUsedAt.Format("2006-01-02 15:04:05")
		}
		fmt.Printf("%-5d %-15s %-30s %-19s %-19s\n", k.ID, k.KeyType, k.Name, k.CreatedAt.Format("2006-01-02 15:04:05"), lastUsed)
	}
}

func handleKeyRevoke(km *auth.KeyManager, args []string) {
	fs := flag.NewFlagSet("key revoke", flag.ExitOnError)
	id := fs.Int64("id", 0, "Key ID (required)")
	fs.Parse(args)

	if *id == 0 {
		fmt.Fprintf(os.Stderr, "Error: --id is required\n")
		fs.Usage()
		os.Exit(1)
	}

	err := km.RevokeKey(*id)
	if err != nil {
		log.Fatalf("Failed to revoke key: %v", err)
	}

	fmt.Printf("Key %d revoked successfully\n", *id)
}

func handleKeyRotate(km *auth.KeyManager, args []string) {
	fs := flag.NewFlagSet("key rotate", flag.ExitOnError)
	id := fs.Int64("id", 0, "Key ID to rotate (required)")
	name := fs.String("name", "", "New key name (optional)")
	fs.Parse(args)

	if *id == 0 {
		fmt.Fprintf(os.Stderr, "Error: --id is required\n")
		fs.Usage()
		os.Exit(1)
	}

	key, err := km.RotateKey(*id, *name)
	if err != nil {
		log.Fatalf("Failed to rotate key: %v", err)
	}

	fmt.Printf("Key rotated successfully\n")
	fmt.Printf("  New Key: %s\n", key)
	fmt.Printf("  Old Key ID %d has been revoked\n", *id)
}

func usage() {
	fmt.Fprintf(os.Stderr, `TGDownloader Admin Tool

Usage:
  tgdownloader-admin <command> [options]

Commands:
  user      User management
  key       API key management
  billing   Billing and credit management
  help      Show this help message

Examples:
  tgdownloader-admin user create --username alice
  tgdownloader-admin key generate --user alice --name prod_key_1
  tgdownloader-admin key list --user-id 1
  tgdownloader-admin billing init-user --user alice --initial 1000
  tgdownloader-admin billing get-balance --user alice
  tgdownloader-admin billing add-credits --user alice --amount 500
  tgdownloader-admin user list

Use 'tgdownloader-admin <command> -h' for more help on a command.
`)
}

func handleUserSetTDLibCreds(dbConn *gorm.DB, args []string) {
	fs := flag.NewFlagSet("user set-tdlib-creds", flag.ExitOnError)
	username := fs.String("user", "", "Username (required)")
	apiID := fs.String("api-id", "", "Telegram API ID (required)")
	apiHash := fs.String("api-hash", "", "Telegram API Hash (required)")
	phone := fs.String("phone", "", "Phone number in E.164 format (required)")
	fs.Parse(args)

	if *username == "" || *apiID == "" || *apiHash == "" || *phone == "" {
		fmt.Fprintf(os.Stderr, "Error: --user, --api-id, --api-hash, and --phone are required\n")
		fs.Usage()
		os.Exit(1)
	}

	// Get user ID
	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*username)
	if err != nil {
		log.Fatalf("Failed to find user '%s': %v", *username, err)
	}

	// Initialize session manager
	sm, err := tdlib.NewSessionManager(dbConn)
	if err != nil {
		log.Fatalf("Failed to initialize session manager: %v", err)
	}

	// Set TDLib session
	err = sm.SetUserSession(userObj.ID, *apiID, *apiHash, *phone)
	if err != nil {
		log.Fatalf("Failed to set TDLib credentials: %v", err)
	}

	fmt.Printf("TDLib credentials set for user '%s' (ID: %d)\n", *username, userObj.ID)
	fmt.Printf("  API ID: [set]\n")
	fmt.Printf("  API Hash: [set]\n")
	fmt.Printf("  Phone: [set]\n")
}

func userUsage() {
	fmt.Fprintf(os.Stderr, `user subcommands:
  create <--username NAME>     Create a new user
  list                         List all users
  get <--id ID | --username NAME> Get user details
  deactivate <--id ID>         Deactivate a user
  set-tdlib-creds <--user USERNAME --api-id ID --api-hash HASH --phone PHONE> Set TDLib credentials
`)
}

func keyUsage() {
	fmt.Fprintf(os.Stderr, `key subcommands:
  generate <--user USERNAME> [--name NAME] [--type TYPE]  Generate a new API key (type: api|webhook, default: api)
  list <--user-id ID>                                      List user's API keys
  revoke <--id ID>                                         Revoke an API key
  rotate <--id ID> [--name NAME]                           Rotate an API key
`)
}

func handleBilling(dbConn *gorm.DB, args []string) {
	if len(args) < 1 {
		fmt.Fprintf(os.Stderr, "billing subcommand required\n")
		billingUsage()
		os.Exit(1)
	}

	logger, _ := zap.NewDevelopment()
	bm := billing.NewManager(dbConn, logger)
	subcommand := args[0]

	switch subcommand {
	case "add-credits":
		handleBillingAddCredits(bm, args[1:], dbConn)
	case "get-balance":
		handleBillingGetBalance(bm, args[1:], dbConn)
	case "history":
		handleBillingHistory(bm, args[1:], dbConn)
	case "init-user":
		handleBillingInitUser(bm, args[1:], dbConn)
	default:
		fmt.Fprintf(os.Stderr, "Unknown billing subcommand: %s\n", subcommand)
		billingUsage()
		os.Exit(1)
	}
}

func handleBillingAddCredits(bm *billing.Manager, args []string, dbConn *gorm.DB) {
	fs := flag.NewFlagSet("billing add-credits", flag.ExitOnError)
	user := fs.String("user", "", "Username (required)")
	amount := fs.Int64("amount", 0, "Credit amount to add (required)")
	reason := fs.String("reason", "", "Reason for credit adjustment (optional)")
	fs.Parse(args)

	if *user == "" || *amount == 0 {
		fmt.Fprintf(os.Stderr, "Error: --user and --amount are required\n")
		fs.Usage()
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*user)
	if err != nil {
		log.Fatalf("Failed to find user '%s': %v", *user, err)
	}

	// Admin ID = 0 (system) for CLI operations
	if err := bm.AdminAdjustCredits(context.Background(), userObj.ID, 0, *amount, *reason); err != nil {
		log.Fatalf("Failed to adjust credits: %v", err)
	}

	// Get updated balance
	balance, err := bm.GetBalance(context.Background(), userObj.ID)
	if err != nil {
		log.Fatalf("Failed to get updated balance: %v", err)
	}

	fmt.Printf("Credits added successfully\n")
	fmt.Printf("  User: %s (ID: %d)\n", *user, userObj.ID)
	fmt.Printf("  Amount: %d\n", *amount)
	fmt.Printf("  New balance: %d\n", balance)
	if *reason != "" {
		fmt.Printf("  Reason: %s\n", *reason)
	}
}

func handleBillingGetBalance(bm *billing.Manager, args []string, dbConn *gorm.DB) {
	fs := flag.NewFlagSet("billing get-balance", flag.ExitOnError)
	user := fs.String("user", "", "Username (required)")
	fs.Parse(args)

	if *user == "" {
		fmt.Fprintf(os.Stderr, "Error: --user is required\n")
		fs.Usage()
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*user)
	if err != nil {
		log.Fatalf("Failed to find user '%s': %v", *user, err)
	}

	balance, err := bm.GetBalance(context.Background(), userObj.ID)
	if err != nil {
		log.Fatalf("Failed to get balance: %v", err)
	}

	fmt.Printf("User: %s (ID: %d)\n", *user, userObj.ID)
	fmt.Printf("Current balance: %d credits\n", balance)
}

func handleBillingHistory(bm *billing.Manager, args []string, dbConn *gorm.DB) {
	fs := flag.NewFlagSet("billing history", flag.ExitOnError)
	user := fs.String("user", "", "Username (required)")
	limit := fs.Int("limit", 10, "Number of records to show (default: 10)")
	fs.Parse(args)

	if *user == "" {
		fmt.Fprintf(os.Stderr, "Error: --user is required\n")
		fs.Usage()
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*user)
	if err != nil {
		log.Fatalf("Failed to find user '%s': %v", *user, err)
	}

	transactions, err := bm.GetTransactionHistory(context.Background(), userObj.ID, *limit, 0)
	if err != nil {
		log.Fatalf("Failed to get transaction history: %v", err)
	}

	if len(transactions) == 0 {
		fmt.Printf("No transactions found for user %s\n", *user)
		return
	}

	fmt.Printf("User: %s (ID: %d)\n\n", *user, userObj.ID)
	fmt.Printf("%-30s %-15s %-10s %-36s %-19s\n", "Type", "Amount", "Task ID", "Reason", "Created At")
	fmt.Println(strings.Repeat("-", 130))

	for _, tx := range transactions {
		taskID := tx.TaskID
		if taskID == "" {
			taskID = "(admin)"
		}
		reason := tx.Reason
		if reason == "" {
			reason = "-"
		}
		fmt.Printf("%-30s %-15d %-10s %-36s %-19s\n",
			tx.Type,
			tx.Amount,
			taskID,
			reason,
			tx.CreatedAt.Format("2006-01-02 15:04:05"),
		)
	}
}

func handleBillingInitUser(bm *billing.Manager, args []string, dbConn *gorm.DB) {
	fs := flag.NewFlagSet("billing init-user", flag.ExitOnError)
	user := fs.String("user", "", "Username (required)")
	initialAmount := fs.Int64("initial", 0, "Initial credit amount (default: 0)")
	fs.Parse(args)

	if *user == "" {
		fmt.Fprintf(os.Stderr, "Error: --user is required\n")
		fs.Usage()
		os.Exit(1)
	}

	um := auth.NewUserManager(dbConn)
	userObj, err := um.GetUserByUsername(*user)
	if err != nil {
		log.Fatalf("Failed to find user '%s': %v", *user, err)
	}

	// Check if user already has credits
	balance, err := bm.GetBalance(context.Background(), userObj.ID)
	if err == nil && balance > 0 {
		fmt.Printf("User %s already has credits initialized (balance: %d)\n", *user, balance)
		return
	}

	// Initialize credits
	if err := bm.InitializeUserCredits(context.Background(), userObj.ID, *initialAmount); err != nil {
		log.Fatalf("Failed to initialize credits: %v", err)
	}

	fmt.Printf("Credits initialized for user %s\n", *user)
	fmt.Printf("  User ID: %d\n", userObj.ID)
	fmt.Printf("  Initial balance: %d credits\n", *initialAmount)
}

func billingUsage() {
	fmt.Fprintf(os.Stderr, `billing subcommands:
  add-credits <--user USERNAME> <--amount N> [--reason REASON]  Add credits to user
  get-balance <--user USERNAME>                                 Get user credit balance
  history <--user USERNAME> [--limit N]                         Get user transaction history
  init-user <--user USERNAME> [--initial N]                     Initialize user credits
`)
}
