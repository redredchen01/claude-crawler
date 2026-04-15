#!/bin/bash

# Deploy session-wrap-backend to Railway
# Usage: bash deploy-railway.sh [project-name]

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deploy session-wrap-backend to Railway${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check Railway CLI
echo -e "${YELLOW}Checking Railway CLI...${NC}"
if ! command -v railway &> /dev/null; then
  echo -e "${RED}✗ Railway CLI not found${NC}"
  echo ""
  echo "Install Railway CLI:"
  echo "  npm install -g @railway/cli"
  echo ""
  echo "Then login:"
  echo "  railway login"
  exit 1
fi
echo -e "${GREEN}✓ Railway CLI ready${NC}"
echo ""

# Set project name
PROJECT_NAME="${1:-session-wrap-backend}"

echo -e "${YELLOW}Step 1/5: Creating Railway project...${NC}"
railway init --name "$PROJECT_NAME" 2>/dev/null || railway switch 2>/dev/null || true
echo -e "${GREEN}✓ Project ready (or already exists)${NC}"
echo ""

# Create .env.example if it doesn't exist
echo -e "${YELLOW}Step 2/5: Setting up environment variables...${NC}"

cat > .env.example << 'EOF'
# Session Wrap Backend Configuration

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/session_wrap

# Server
PORT=3000
NODE_ENV=production

# JWT Authentication
JWT_SECRET=your-secret-key-here-change-in-production

# Cloud Storage (optional)
# S3_BUCKET=your-bucket
# S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=

# Observability (optional)
# SENTRY_DSN=
# LOG_LEVEL=info
EOF

echo -e "${GREEN}✓ Environment template created (.env.example)${NC}"
echo ""

# Create package.json if it doesn't exist
if [ ! -f "package.json" ]; then
  echo -e "${YELLOW}Step 3/5: Creating package.json...${NC}"

  cat > package.json << 'EOF'
{
  "name": "session-wrap-backend",
  "version": "3.4.0",
  "description": "Cloud backend for session-wrap agent coordination",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.0.3",
    "jsonwebtoken": "^9.0.0",
    "pg": "^8.9.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0",
    "@types/express": "^4.17.17",
    "@types/node": "^18.15.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.0.5"
  }
}
EOF

  echo -e "${GREEN}✓ package.json created${NC}"
else
  echo -e "${GREEN}✓ package.json exists${NC}"
fi
echo ""

# Create Procfile for Railway
echo -e "${YELLOW}Step 4/5: Configuring Railway deployment...${NC}"

cat > Procfile << 'EOF'
web: npm run build && npm start
EOF

echo -e "${GREEN}✓ Procfile created${NC}"
echo ""

# Show Railway deployment commands
echo -e "${YELLOW}Step 5/5: Deployment ready${NC}"
echo ""
echo "To deploy manually:"
echo -e "${BLUE}  railway up${NC}"
echo ""
echo "To connect to Railway database:"
echo -e "${BLUE}  railway connect${NC}"
echo ""
echo "To set environment variables:"
echo -e "${BLUE}  railway variables${NC}"
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deployment Configuration Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Update .env with your production values:"
echo -e "   ${BLUE}cp .env.example .env${NC}"
echo -e "   ${BLUE}nano .env  # Edit with production values${NC}"
echo ""
echo "2. Configure Railway:"
echo -e "   ${BLUE}railway variables set DATABASE_URL <your-db-url>${NC}"
echo -e "   ${BLUE}railway variables set JWT_SECRET <random-secret>${NC}"
echo ""
echo "3. Deploy to Railway:"
echo -e "   ${BLUE}railway up${NC}"
echo ""
echo "4. Verify deployment:"
echo -e "   ${BLUE}railway logs${NC}"
echo ""
echo "Documentation: See docs/PRODUCTION-SETUP.md for detailed instructions"
echo ""
