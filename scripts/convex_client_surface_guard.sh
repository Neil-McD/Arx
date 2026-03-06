#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Convex client surface guard =="

ALLOWLIST_REGEX='^shared/(convexAuthenticatedClient|convexRuntime)\.ts:'
PATTERN='import \{ ConvexHttpClient \} from "convex/browser"|new ConvexHttpClient\('

echo "[1/3] Scanning runtime/product paths for direct ConvexHttpClient usage..."
MATCHES="$(rg -n --no-heading -S "$PATTERN" shared apps src convex -g '*.{ts,tsx,js,jsx,mts,cts}' || true)"

if [[ -z "$MATCHES" ]]; then
  echo "[2/3] No direct ConvexHttpClient usage found."
  echo "[3/3] Guard passed."
  echo "PASS: Convex client surface is centralized."
  exit 0
fi

echo "[2/3] Validating matches against seam allowlist..."
VIOLATIONS="$(echo "$MATCHES" | rg -n -v "$ALLOWLIST_REGEX" || true)"
if [[ -n "$VIOLATIONS" ]]; then
  echo "FAIL: direct ConvexHttpClient usage found outside seam files."
  echo "$VIOLATIONS"
  exit 1
fi

echo "[3/3] Guard passed."
echo "PASS: Convex client surface is centralized."
