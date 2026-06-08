#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="$ROOT_DIR/benchmarks/reports"
API_URL="${API_URL:-http://localhost:3000}"
mkdir -p "$REPORT_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
stats_file="$REPORT_DIR/docker-stats-$timestamp.txt"
memory_file="$REPORT_DIR/api-memory-$timestamp.json"

if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream > "$stats_file" || true
else
  printf 'docker command not found\n' > "$stats_file"
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS "$API_URL/health/memory" > "$memory_file" || printf '{"ok":false,"error":"api memory endpoint unavailable"}\n' > "$memory_file"
else
  printf '{"ok":false,"error":"curl command not found"}\n' > "$memory_file"
fi

printf 'wrote %s\n' "$stats_file"
printf 'wrote %s\n' "$memory_file"
