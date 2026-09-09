#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_URL="http://localhost:5173"
API_URL="http://localhost:8080"

if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required to check development server readiness.\n' >&2
  exit 1
fi

http_status() {
  local status
  status=$(curl -q --noproxy '*' --silent --output /dev/null \
    --write-out '%{http_code}' --max-time 2 "$1") || return 0
  printf '%s' "$status"
}

# Refuse an existing session rather than announcing readiness for old servers.
for url in "$APP_URL/" "$API_URL/api/auth/me"; do
  if [[ -n "$(http_status "$url")" ]]; then
    printf 'A server is already responding at %s. Stop it before running make dev.\n' "$url" >&2
    exit 1
  fi
done

print_ready() {
  local green='' cyan='' reset=''
  if [[ -t 1 && -z "${NO_COLOR+x}" && "${TERM:-dumb}" != dumb ]]; then
    green=$'\033[1;32m' cyan=$'\033[36m' reset=$'\033[0m'
  fi
  printf '\n\n  %sSuccess%s\n  Live at: %s%s%s\n\n' "$green" "$reset" "$cyan" "$APP_URL" "$reset"
}

# Give each service its own process group so shutdown includes Maven's Java
# process and npm's Vite process, not just their launcher shells.
set -m
api_pid=""
web_pid=""

servers_running() {
  kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null
}

cleanup() {
  trap '' INT TERM
  printf '\nStopping development servers...\n'
  local pid
  for pid in "$api_pid" "$web_pid"; do
    [[ -z "$pid" ]] || kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Starting API (%s) and web (%s).\n' "$API_URL" "$APP_URL"

(cd "$PROJECT_DIR/services/api" && exec ./mvnw spring-boot:run) </dev/null &
api_pid=$!

(cd "$PROJECT_DIR/apps/web" && exec npm run dev -- --strictPort) </dev/null &
web_pid=$!
ready=false

while servers_running; do

  if [[ "$ready" == false ]] \
    && [[ "$(http_status "$API_URL/api/auth/me")" == 401 ]] \
    && [[ "$(http_status "$APP_URL/")" == 200 ]] \
    && [[ "$(http_status "$APP_URL/api/auth/me")" == 401 ]] \
    && servers_running; then
    print_ready
    ready=true
  fi
  sleep 1
done

printf '\nA development server exited; stopping the other service.\n'
if ! kill -0 "$api_pid" 2>/dev/null; then
  wait "$api_pid"
else
  wait "$web_pid"
fi
