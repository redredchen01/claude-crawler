package main

import (
	"flag"
	"fmt"
	"os"
)

const version = "0.2.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "download":
		downloadCmd(os.Args[2:])
	case "mcp":
		mcpCmd(os.Args[2:])
	case "version":
		fmt.Printf("tgdownloader v%s\n", version)
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "❌ Unknown command: %s\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	usage := `🎬 TGDownloader CLI v` + version + `

Usage:
  tgdownloader <command> [options]

Commands:
  download    Download video/file from Telegram
  mcp         Start MCP (Model Context Protocol) server for AI agents
  version     Show version
  help        Show this help message

Download Options:
  -u, --url <url>           Telegram URL (t.me/channel/msg_id or t.me/s/channel/post_id)
  -o, --output <path>       Output file path (default: downloads to current dir)
  -p, --phone <number>      Phone number with country code (e.g. +1234567890)
                            Default: reads from TELEGRAM_PHONE env var
      --api-id <id>         Telegram API ID (default: TELEGRAM_API_ID env var)
      --api-hash <hash>     Telegram API hash (default: TELEGRAM_API_HASH env var)
  -v, --verbose             Show detailed progress
  -h, --help                Show help

Examples:
  # Download using Telegram URL
  tgdownloader download -u "https://t.me/i51_co/1406" -o video.mp4

  # Download using post link
  tgdownloader download -u "t.me/s/channel_name/5678" -o output.mp4

  # With custom phone and API credentials
  tgdownloader download -u "t.me/channel/123" -o output.mp4 \
    -p "+1234567890" --api-id 12345678 --api-hash abc123def456...

Environment Variables:
  TELEGRAM_PHONE            Phone number (if --phone not provided)
  TELEGRAM_API_ID           API ID (if --api-id not provided)
  TELEGRAM_API_HASH         API hash (if --api-hash not provided)
  TGDOWNLOADER_TOKEN        API token for authentication (if --token not provided)
  TGDOWNLOADER_REQUIRE_TOKEN Set to "true" to require token validation
`
	fmt.Print(usage)
}

func downloadCmd(args []string) {
	fs := flag.NewFlagSet("download", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, `Download video from Telegram

Usage:
  tgdownloader download [options]

Options:
`)
		fs.PrintDefaults()
	}

	url := fs.String("u", "", "Telegram URL")
	output := fs.String("o", "", "Output file path")
	phone := fs.String("p", os.Getenv("TELEGRAM_PHONE"), "Phone number")
	apiID := fs.String("api-id", os.Getenv("TELEGRAM_API_ID"), "Telegram API ID")
	apiHash := fs.String("api-hash", os.Getenv("TELEGRAM_API_HASH"), "Telegram API hash")
	token := fs.String("token", os.Getenv("TGDOWNLOADER_TOKEN"), "API token for authentication")
	verbose := fs.Bool("v", false, "Verbose output")
	batch := fs.String("batch", "", "Batch file with URLs (one per line, use - for stdin)")
	concurrent := fs.Int("concurrent", 2, "Number of concurrent downloads")
	info := fs.Bool("info", false, "Show metadata without downloading")
	showHelp := fs.Bool("help", false, "Show help")

	if err := fs.Parse(args); err != nil {
		os.Exit(1)
	}

	if *showHelp {
		fs.Usage()
		os.Exit(0)
	}

	// Verify API token (before any operations)
	expectedToken := os.Getenv("TGDOWNLOADER_TOKEN")
	if expectedToken == "" {
		// If no token is set in env, allow access (for development)
		if os.Getenv("TGDOWNLOADER_REQUIRE_TOKEN") == "true" {
			fmt.Fprintf(os.Stderr, "❌ Error: TGDOWNLOADER_TOKEN is required but not set\n")
			os.Exit(1)
		}
	} else if *token != expectedToken {
		fmt.Fprintf(os.Stderr, "❌ Error: invalid or missing API token\n")
		fmt.Fprintf(os.Stderr, "   Set via -token flag or TGDOWNLOADER_TOKEN env var\n")
		os.Exit(1)
	}

	// Check for batch mode
	if *batch != "" {
		if err := runBatch(*batch, *phone, *apiID, *apiHash, *concurrent, *verbose); err != nil {
			fmt.Fprintf(os.Stderr, "❌ Batch download failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Validate inputs
	if *url == "" {
		fmt.Fprintf(os.Stderr, "❌ Error: -u/--url is required (or use --batch for multiple URLs)\n")
		fs.Usage()
		os.Exit(1)
	}

	if *apiID == "" || *apiHash == "" {
		fmt.Fprintf(os.Stderr, "❌ Error: TELEGRAM_API_ID and TELEGRAM_API_HASH are required\n")
		fmt.Fprintf(os.Stderr, "   Set via -api-id/-api-hash or environment variables\n")
		os.Exit(1)
	}

	if *phone == "" {
		fmt.Fprintf(os.Stderr, "❌ Error: phone number is required\n")
		fmt.Fprintf(os.Stderr, "   Set via -p or TELEGRAM_PHONE env var\n")
		os.Exit(1)
	}

	// Run download
	if err := download(downloadOptions{
		URL:     *url,
		Output:  *output,
		Phone:   *phone,
		APIId:   *apiID,
		APIHash: *apiHash,
		Verbose: *verbose,
		InfoOnly: *info,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Download failed: %v\n", err)
		os.Exit(1)
	}
}

type downloadOptions struct {
	URL      string
	Output   string
	Phone    string
	APIId    string
	APIHash  string
	Verbose  bool
	InfoOnly bool
}
