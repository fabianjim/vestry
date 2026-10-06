#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$API_DIR/target/eval-classpath.txt" ]] || {
  echo 'Compile the evaluation runner first with make eval-ai.' >&2
  exit 1
}
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
exec "$JAVA_BIN" -cp "$API_DIR/target/test-classes:$API_DIR/target/classes:$(cat "$API_DIR/target/eval-classpath.txt")" \
  me.vestry.service.DigestEvalRunner "$@"
