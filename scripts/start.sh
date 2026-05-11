#!/bin/bash
# Quick start script for Veritas

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}
╔══════════════════════════════════════════╗
║                                          ║
║     Veritas Research Platform            ║
║     Quick Start Script                   ║
║                                          ║
╚══════════════════════════════════════════╝
${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running or not installed${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your API keys before continuing${NC}"
    echo -e "   At minimum, you need to set OPENAI_API_KEY or AWS credentials"
    exit 1
fi

# Function to check if a variable is set in .env
check_env_var() {
    local var_name=$1
    if grep -q "^${var_name}=" .env; then
        local value=$(grep "^${var_name}=" .env | cut -d '=' -f2-)
        if [ -n "$value" ] && [ "$value" != "sk-..." ] && [ "$value" != "=" ]; then
            return 0
        fi
    fi
    return 1
}

# Check for LLM provider credentials
if check_env_var "OPENAI_API_KEY" || check_env_var "AWS_ACCESS_KEY_ID"; then
    echo -e "${GREEN}✓ LLM provider credentials detected${NC}"
else
    echo -e "${RED}✗ No LLM provider credentials found in .env${NC}"
    echo -e "   Please add OPENAI_API_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY"
    exit 1
fi

echo ""
echo -e "${BLUE}Starting Veritas services...${NC}"
echo ""

# Stop any existing containers
echo -e "${YELLOW}→ Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Start services
echo -e "${YELLOW}→ Starting PostgreSQL, Redis, and API...${NC}"
docker-compose up -d

# Wait for PostgreSQL
echo -e "${YELLOW}→ Waiting for PostgreSQL...${NC}"
until docker-compose exec -T postgres pg_isready -U veritas -d veritas > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for Redis
echo -e "${YELLOW}→ Waiting for Redis...${NC}"
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✓ Redis is ready${NC}"

# Check if migrations are needed
echo -e "${YELLOW}→ Running database migrations...${NC}"
if docker-compose exec -T api npx prisma migrate deploy; then
    echo -e "${GREEN}✓ Database migrations complete${NC}"
else
    echo -e "${RED}✗ Migration failed${NC}"
    echo "   Check logs with: docker-compose logs api"
    exit 1
fi

# Wait for API health check
echo -e "${YELLOW}→ Verifying API health...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ API is healthy${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ API failed to start within 30 seconds${NC}"
        echo "   Check logs with: docker-compose logs api"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Veritas is running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "  API Endpoint: http://localhost:3000"
echo "  Health Check: http://localhost:3000/health"
echo "  PostgreSQL:   localhost:5432"
echo "  Redis:        localhost:6379"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose logs -f api"
echo "  Stop:         docker-compose down"
echo "  Restart:      docker-compose restart api"
echo "  Database:     docker-compose exec postgres psql -U veritas -d veritas"
echo ""
