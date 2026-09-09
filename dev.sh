#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Give each service its own process group so shutdown includes Maven's Java
# process and npm's Vite process, not just their launcher shells.
set -m
api_pid=""
web_pid=""

cleanup() {
  trap '' INT TERM
  printf '\nStopping development servers...\n'
  if [[ -n "$api_pid" ]]; then
    kill -TERM -- "-$api_pid" 2>/dev/null || true
  fi
  if [[ -n "$web_pid" ]]; then
    kill -TERM -- "-$web_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Starting API (http://localhost:8080) and web (http://localhost:5173).\n'

(
  cd "$PROJECT_DIR/services/api"
  exec ./mvnw spring-boot:run
) </dev/null &
api_pid=$!

(
  cd "$PROJECT_DIR/apps/web"
  exec npm run dev
) </dev/null &
web_pid=$!

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

printf '\nA development server exited; stopping the other service.\n'
if ! kill -0 "$api_pid" 2>/dev/null; then
  wait "$api_pid"
else
  wait "$web_pid"
fi
