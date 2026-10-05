.PHONY: help dev dev-ai test build

help:
	@printf '%s\n' \
	  'Vestry development commands:' \
	  '  make dev     Start the API and web servers' \
	  '  make dev-ai  Start development servers with sample AI briefing content' \
	  '  make test    Run tests' \
	  '  make build   Package the API and build the web app without tests' \
	  '  make help    Show this help'

dev:
	@./dev.sh

dev-ai:
	@VESTRY_MOCK_BRIEFING=1 ./dev.sh

test:
	cd services/api && ./mvnw test
	cd apps/web && npm test -- --run

build:
	cd services/api && ./mvnw package -DskipTests
	cd apps/web && npm run build
