#!/bin/bash

# Initialize SEO Content System Database

set -e

echo "🔧 Initializing SEO Content System Database..."

cd "$(dirname "$0")/.."

# Backend setup
echo "📦 Installing backend dependencies..."
cd backend
npm install

echo "🗄️  Creating database..."
npm run db:push

echo "✅ Database initialized"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start development:"
echo "  Backend:  cd backend && npm run dev"
echo "  Frontend: cd frontend && npm run dev"
echo ""
