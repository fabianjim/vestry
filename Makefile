.PHONY: help dev test build

help:
	@printf '%s\n' \
	  'Vestry development commands:' \
	  '  make dev    Start the API and web servers' \
	  '  make test   Run backend and frontend tests once' \
	  '  make build  Package the API and build the web app without tests' \
	  '  make help   Show this help'

dev:
	@./dev.sh

test:
	cd services/api && ./mvnw test
	cd apps/web && npm test -- --run

build:
	cd services/api && ./mvnw package -DskipTests
	cd apps/web && npm run build
