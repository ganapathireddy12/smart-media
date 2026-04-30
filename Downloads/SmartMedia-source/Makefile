# SmartMedia Docker Makefile
# Simplifies Docker commands for common tasks

.PHONY: help dev prod ai build clean logs shell test backup restore

# Default target
help:
	@echo "SmartMedia Docker Commands:"
	@echo ""
	@echo "  make dev          - Start development environment"
	@echo "  make prod         - Start production environment"
	@echo "  make ai           - Start AI engine only"
	@echo "  make build        - Build all Docker images"
	@echo "  make clean        - Stop and remove containers"
	@echo "  make logs         - View container logs"
	@echo "  make shell        - Open shell in dev container"
	@echo "  make test         - Run tests in container"
	@echo "  make backup       - Backup Docker volumes"
	@echo "  make restore      - Restore Docker volumes"
	@echo "  make restart      - Restart containers"
	@echo "  make ps           - Show running containers"
	@echo ""

# Development environment
dev:
	@echo "🚀 Starting development environment..."
	docker-compose --profile dev up -d
	@echo "✅ Development server started at http://localhost:5173"

# Production environment
prod:
	@echo "🏭 Starting production environment..."
	docker-compose --profile prod up -d --build
	@echo "✅ Production server started at http://localhost:5000"

# AI engine only
ai:
	@echo "🤖 Starting AI engine..."
	docker-compose --profile ai-only up -d
	@echo "✅ AI engine started at http://localhost:5001"

# Build all images
build:
	@echo "🔨 Building Docker images..."
	docker-compose build --parallel

# Clean up containers and volumes
clean:
	@echo "🧹 Cleaning up..."
	docker-compose --profile dev down
	docker-compose --profile prod down
	docker-compose --profile ai-only down
	@echo "✅ Cleanup complete"

# Clean with volumes
clean-all:
	@echo "🧹 Cleaning up (including volumes)..."
	docker-compose --profile dev down -v
	docker-compose --profile prod down -v
	docker-compose --profile ai-only down -v
	@echo "✅ Full cleanup complete"

# View logs
logs:
	docker-compose logs -f

# Open shell in dev container
shell:
	docker exec -it smartmedia-dev sh

# Run tests
test:
	docker-compose --profile dev run --rm smartmedia-dev npm test

# Backup volumes
backup:
	@echo "💾 Creating backup..."
	@mkdir -p backups
	docker run --rm \
		-v smartmedia_smartmedia-data:/data \
		-v smartmedia_smartmedia-models:/models \
		-v smartmedia_smartmedia-media:/media \
		-v $$(pwd)/backups:/backup \
		alpine tar czf /backup/smartmedia-backup-$$(date +%Y%m%d-%H%M%S).tar.gz /data /models /media
	@echo "✅ Backup created in ./backups/"

# Restore volumes (use BACKUP_FILE=filename.tar.gz)
restore:
	@echo "📦 Restoring from backup..."
	@if [ -z "$(BACKUP_FILE)" ]; then \
		echo "❌ Please specify BACKUP_FILE=filename.tar.gz"; \
		exit 1; \
	fi
	docker run --rm \
		-v smartmedia_smartmedia-data:/data \
		-v smartmedia_smartmedia-models:/models \
		-v smartmedia_smartmedia-media:/media \
		-v $$(pwd)/backups:/backup \
		alpine tar xzf /backup/$(BACKUP_FILE) -C /
	@echo "✅ Restore complete"

# Restart containers
restart:
	@echo "🔄 Restarting containers..."
	docker-compose restart
	@echo "✅ Restart complete"

# Show running containers
ps:
	docker-compose ps

# Show container stats
stats:
	docker stats --no-stream

# Prune unused Docker resources
prune:
	@echo "🧹 Pruning unused Docker resources..."
	docker system prune -f
	@echo "✅ Prune complete"

# Update base images
update:
	@echo "⬆️  Updating base images..."
	docker-compose pull
	@echo "✅ Update complete"

# Run linting
lint:
	docker-compose --profile dev run --rm smartmedia-dev npm run lint

# Development with rebuild
dev-rebuild:
	@echo "🔨 Rebuilding and starting development..."
	docker-compose --profile dev up -d --build

# Production with rebuild
prod-rebuild:
	@echo "🔨 Rebuilding and starting production..."
	docker-compose --profile prod up -d --build
