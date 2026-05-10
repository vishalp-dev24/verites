#!/bin/bash
# Development setup script for Research Platform

set -e

echo "🚀 Setting up Research Platform development environment..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required. Found: $(node --version)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check for pnpm or install it
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "✅ pnpm version: $(pnpm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your actual API keys"
fi

# Setup database (placeholder - would use Prisma in real setup)
echo "🗄️  Database setup..."
echo "   Run: npx prisma migrate dev"

# Setup Redis (placeholder)
echo "📬 Redis setup..."
echo "   Run: docker run -d -p 6379:6379 redis:alpine"

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update .env with your API keys"
echo "  2. Start Redis: docker run -d -p 6379:6379 redis:alpine"
echo "  3. Run migrations: npx prisma migrate dev"
echo "  4. Start development: pnpm dev"
echo ""
