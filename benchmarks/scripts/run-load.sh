#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/benchmarks/reports"
API_URL="${API_URL:-http://localhost:3000}"
mkdir -p "$REPORT_DIR"

if ! command -v k6 >/dev/null 2>&1; then
  printf 'k6 is required. Install: brew install k6\n' >&2
  exit 1
fi

printf 'capturing stats before load\n'
API_URL="$API_URL" "$ROOT_DIR/benchmarks/scripts/collect-stats.sh"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
printf 'running ingest benchmark\n'
API_URL="$API_URL" k6 run --summary-export "$REPORT_DIR/k6-ingest-$timestamp.json" "$ROOT_DIR/benchmarks/k6/ingest-http.js"

printf 'capturing stats after ingest\n'
API_URL="$API_URL" "$ROOT_DIR/benchmarks/scripts/collect-stats.sh"

printf 'running search benchmark\n'
API_URL="$API_URL" k6 run --summary-export "$REPORT_DIR/k6-search-$timestamp.json" "$ROOT_DIR/benchmarks/k6/search.js"

printf 'capturing stats after search\n'
API_URL="$API_URL" "$ROOT_DIR/benchmarks/scripts/collect-stats.sh"

printf 'reports written to %s\n' "$REPORT_DIR"
