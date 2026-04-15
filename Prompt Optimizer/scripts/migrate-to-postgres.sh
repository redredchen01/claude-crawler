#!/bin/bash

# PostgreSQL Migration Script
# Automates SQLite → PostgreSQL migration with error handling

set -e  # Exit on any error

echo "🚀 Prompt Optimizer PostgreSQL Migration Script"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.dev.yml"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="prompt_optimizer"
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check docker-compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Check if in correct directory
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "docker-compose.dev.yml not found. Are you in the Prompt Optimizer directory?"
        exit 1
    fi

    # Check if Prisma schema exists
    if [ ! -f "prisma/schema.prisma" ]; then
        log_error "prisma/schema.prisma not found"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Step 1: Start PostgreSQL
start_postgres() {
    log_info "Step 1: Starting PostgreSQL containers..."

    if docker-compose -f "$DOCKER_COMPOSE_FILE" ps | grep -q "postgres.*Up"; then
        log_warning "PostgreSQL already running, skipping startup"
    else
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

        # Wait for PostgreSQL to be healthy
        log_info "Waiting for PostgreSQL to be ready..."
        for i in {1..30}; do
            if docker exec prompt-optimizer-postgres pg_isready -U postgres &> /dev/null; then
                log_success "PostgreSQL is ready"
                return 0
            fi
            echo -n "."
            sleep 1
        done

        log_error "PostgreSQL failed to start"
        exit 1
    fi
}

# Step 2: Create database
create_database() {
    log_info "Step 2: Creating PostgreSQL database..."

    if docker exec prompt-optimizer-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$POSTGRES_DB"; then
        log_warning "Database '$POSTGRES_DB' already exists, skipping creation"
    else
        docker exec prompt-optimizer-postgres psql -U postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"
        log_success "Database created"
    fi
}

# Step 3: Run migration
run_migration() {
    log_info "Step 3: Running Prisma migration..."

    export DATABASE_URL="$DATABASE_URL"

    if npx prisma migrate deploy; then
        log_success "Migration completed successfully"
    else
        log_error "Migration failed"
        exit 1
    fi
}

# Step 4: Verify schema
verify_schema() {
    log_info "Step 4: Verifying schema creation..."

    table_count=$(docker exec prompt-optimizer-postgres psql -U postgres -d "$POSTGRES_DB" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | grep -o '[0-9]\+' | head -1)

    if [ "$table_count" -gt 10 ]; then
        log_success "Schema created with $table_count tables"

        # Show table list
        log_info "Tables created:"
        docker exec prompt-optimizer-postgres psql -U postgres -d "$POSTGRES_DB" -c "\dt" | grep public
    else
        log_error "Schema verification failed (expected >10 tables, got $table_count)"
        exit 1
    fi
}

# Step 5: Run tests
run_tests() {
    log_info "Step 5: Running tests against PostgreSQL..."

    export DATABASE_URL="$DATABASE_URL"

    if npm run test:ci 2>&1 | tail -10; then
        log_success "Tests completed"
    else
        log_warning "Some tests failed - review output above"
    fi
}

# Step 6: Performance benchmark
run_benchmark() {
    log_info "Step 6: Running performance benchmark (optional)..."

    read -p "Run performance benchmark? (y/n) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        export DATABASE_URL="$DATABASE_URL"
        npm run test:load
    else
        log_info "Skipping benchmark"
    fi
}

# Main execution
main() {
    log_info "Starting PostgreSQL migration process..."
    echo ""

    check_prerequisites
    echo ""

    start_postgres
    echo ""

    create_database
    echo ""

    run_migration
    echo ""

    verify_schema
    echo ""

    run_tests
    echo ""

    run_benchmark
    echo ""

    log_success "PostgreSQL migration completed! 🎉"
    echo ""
    echo "Next steps:"
    echo "1. Update .env or .env.local with PostgreSQL connection string"
    echo "2. Run 'npm run dev' to start development server"
    echo "3. Monitor logs for any connection issues"
    echo ""
    echo "To stop PostgreSQL: docker-compose -f docker-compose.dev.yml down"
    echo "To view logs: docker-compose -f docker-compose.dev.yml logs postgres"
}

# Trap errors
trap 'log_error "Migration script failed"; exit 1' ERR

# Run main
main "$@"
