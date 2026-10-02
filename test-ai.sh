#!/usr/bin/env bash
set +x
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$PROJECT_DIR/services/api"
ENV_FILE="$API_DIR/.env.ai-diagnostic"

fail() { printf 'AI diagnostic: %s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: ./test-ai.sh [briefing|news]' \
    '  briefing  Test news plus a synthetic briefing (default; reserves at most $0.03).' \
    '  news      Test news only (reserves at most $0.02).' \
    'Configuration: services/api/.env.ai-diagnostic. Only local PostgreSQL is accepted.' \
    'AI is enabled only for this test process; dashboard data is not changed.'
}
[[ $# -le 1 ]] || { usage; exit 1; }
case "${1:-briefing}" in
  briefing) mode=briefing; ceiling=30000 ;;
  news) mode=news; ceiling=20000 ;;
  -h|--help) usage; exit 0 ;;
  *) usage; exit 1 ;;
esac

[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
command -v psql >/dev/null || fail 'psql is required and must be on PATH.'
# This script runs in its own shell. Sourcing this trusted local file cannot enable AI in the parent shell.
set -a
source "$ENV_FILE"
set +a
for name in OPENAI_API_KEY VESTRY_AI_DIAGNOSTIC_DB_URL VESTRY_AI_DIAGNOSTIC_DB_USERNAME VESTRY_AI_DIAGNOSTIC_DB_PASSWORD; do
  [[ -n "${!name:-}" ]] || fail "$name is missing from the environment file."
done
for name in VESTRY_AI_LIFETIME_BUDGET_MICROS VESTRY_AI_DAILY_BUDGET_MICROS VESTRY_AI_DAILY_GENERATIONS; do
  value="${!name:-}"
  [[ "$value" =~ ^[0-9]{1,12}$ ]] || fail "$name must be a positive integer."
  value=$((10#$value))
  (( value > 0 )) || fail "$name must be greater than zero."
  export "$name=$value"
done

# Reject remote hosts, embedded credentials, and connection options that could redirect psql/JDBC.
local_url='^jdbc:postgresql://(localhost|127\.0\.0\.1|\[::1\])(:([0-9]+))?/([A-Za-z0-9_-]+)(\?sslmode=(disable|allow|prefer|require|verify-ca|verify-full))?$'
[[ "$VESTRY_AI_DIAGNOSTIC_DB_URL" =~ $local_url ]] || fail 'Use a local JDBC PostgreSQL URL (localhost, 127.0.0.1, or [::1]); only the optional sslmode query parameter is supported.'
export PGHOST="${BASH_REMATCH[1]}" PGPORT="${BASH_REMATCH[3]:-5432}" PGDATABASE="${BASH_REMATCH[4]}" PGSSLMODE="${BASH_REMATCH[6]:-prefer}"
[[ "$PGHOST" != '[::1]' ]] || export PGHOST='::1'
export PGUSER="$VESTRY_AI_DIAGNOSTIC_DB_USERNAME" PGPASSWORD="$VESTRY_AI_DIAGNOSTIC_DB_PASSWORD" PGCONNECT_TIMEOUT=5

printf 'Checking local database and AI allowance…\n'
accounting=$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -w -At -F '|' -v ON_ERROR_STOP=1 -c "
SELECT blocked,
       (SELECT coalesce(sum(charged_micros), 0) FROM ai_generations),
       (SELECT coalesce(sum(charged_micros), 0) FROM ai_generations WHERE budget_day = (now() AT TIME ZONE 'America/New_York')::date),
       (SELECT count(*) FROM ai_generations WHERE budget_day = (now() AT TIME ZONE 'America/New_York')::date)
FROM ai_budget WHERE id = 1;") || fail 'Could not read local AI accounting. Check the connection and application schema.'
[[ -n "$accounting" ]] || fail 'The local ai_budget row with id=1 is missing; initialize it before testing.'
IFS='|' read -r blocked lifetime_spent daily_spent attempts <<< "$accounting"
[[ "$blocked" == f ]] || fail 'The local AI budget is blocked; inspect its accounting before continuing.'
for value in "$lifetime_spent" "$daily_spent" "$attempts"; do
  [[ "$value" =~ ^[0-9]+$ ]] || fail 'Unexpected accounting values; no request made.'
done
(( lifetime_spent + ceiling <= VESTRY_AI_LIFETIME_BUDGET_MICROS )) || fail "Insufficient lifetime allowance: $lifetime_spent microdollars already used; this check requires $ceiling remaining."
(( daily_spent + ceiling <= VESTRY_AI_DAILY_BUDGET_MICROS )) || fail 'Insufficient daily allowance for this diagnostic.'
(( attempts < VESTRY_AI_DAILY_GENERATIONS )) || fail 'The daily generation limit has been reached.'

printf 'Running %s diagnostic with synthetic data (reservation ceiling: %s microdollars).\n' "$mode" "$ceiling"
# The Java diagnostic validates the schema and atomically enforces spending limits again.
cd "$API_DIR"
if VESTRY_AI_ENABLED=true ./mvnw test -Dtest=NewsDiagnostic -Dvestry.ai.diagnostic=true "-Dvestry.ai.diagnostic.mode=$mode"; then
  printf '\nAI diagnostic passed. Your local application AI setting is unchanged.\n'
else
  printf '\nAI diagnostic failed. Check the diagnostic messages above; no automatic retry was made.\n' >&2
  exit 1
fi
