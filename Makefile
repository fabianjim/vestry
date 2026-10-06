.PHONY: help dev dev-ai test build eval-ai

help:
	@printf '%s\n' \
	  'Vestry development commands:' \
	  '  make dev     Start the API and web servers' \
	  '  make test    Run tests' \
	  '  make build   Package the API and build the web app without tests' \
	  '  make dev-ai  Start development servers with sample AI briefing content' \
	  '  make eval-ai Evaluate AI briefings' \
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

eval-ai:
	@set -eu; \
	  test -f services/api/.env.ai-diagnostic || { echo 'Missing services/api/.env.ai-diagnostic.' >&2; exit 1; }; \
	  . ./services/api/.env.ai-diagnostic; \
	  test -n "$${OPENAI_API_KEY:-}" || { echo 'Set OPENAI_API_KEY in services/api/.env.ai-diagnostic.' >&2; exit 1; }; \
	  export OPENAI_API_KEY; \
	  export LANGFUSE_TRACING_ENABLED LANGFUSE_BASE_URL LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY LANGFUSE_RELEASE; \
	  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 22)) { console.error("Promptfoo requires Node >=22.22.0."); process.exit(1); }'; \
	  cd services/api; \
	  ./mvnw -q test-compile dependency:build-classpath -DincludeScope=test -Dmdep.outputFile=target/eval-classpath.txt; \
	  mkdir -p target/evals; \
	  cd evals; \
	  VESTRY_AI_EVAL=true PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_SHARING=true \
	  npm exec --yes --package=promptfoo@0.124.0 -- promptfoo eval \
	  -c promptfooconfig.yaml --max-concurrency 1 --no-cache --no-share --no-write -o ../target/evals/results.json
