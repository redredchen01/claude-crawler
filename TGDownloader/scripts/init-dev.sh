#!/bin/bash
# Initialize development environment with test user and API key

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== TGDownloader Development Setup ===${NC}"

# Check if server is running
echo "Checking if server is running on localhost:8080..."
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Server is not running on localhost:8080${NC}"
    echo "Start the server first:"
    echo "  go run cmd/server/main.go"
    exit 1
fi

ADMIN_TOKEN=${ADMIN_TOKEN:-"dev-admin-token-12345"}

echo -e "${GREEN}✓ Server is running${NC}"
echo ""
echo "Using ADMIN_TOKEN: $ADMIN_TOKEN"
echo ""

# Step 1: Create user
echo "Step 1: Creating test user..."
USER_RESPONSE=$(curl -s -X POST http://localhost:8080/admin/users \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser"}')

USER_ID=$(echo "$USER_RESPONSE" | grep -o '"user_id":[0-9]*' | cut -d: -f2)

if [ -z "$USER_ID" ]; then
    echo -e "${RED}Failed to create user. Response: $USER_RESPONSE${NC}"
    echo "Make sure ADMIN_TOKEN is correct and matches ADMIN_TOKEN env var on server"
    exit 1
fi

echo -e "${GREEN}✓ User created with ID: $USER_ID${NC}"

# Step 2: Generate API key
echo ""
echo "Step 2: Generating API key..."
KEY_RESPONSE=$(curl -s -X POST "http://localhost:8080/admin/keys/$USER_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"key_name":"test-key"}')

API_KEY=$(echo "$KEY_RESPONSE" | grep -o '"api_key":"[^"]*' | cut -d'"' -f4)

if [ -z "$API_KEY" ]; then
    echo -e "${RED}Failed to generate API key. Response: $KEY_RESPONSE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ API key generated${NC}"
echo ""

# Step 3: Display setup info
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Now open http://localhost:8080/app in your browser and:"
echo "1. Click ⚙ (Settings) button"
echo "2. Enter the API Key in the 'General' tab:"
echo ""
echo -e "${YELLOW}API Key: $API_KEY${NC}"
echo ""
echo "3. (Optional) For Telegram features, generate a Telegram API ID and API Hash from:"
echo "   https://my.telegram.org/apps"
echo ""
echo "4. Go to the 'Telegram' tab to authenticate with your phone number"
echo ""
