#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_FILE="src/App.tsx"
CLIENT_FILE="src/runtime/arp/tauriClient.ts"

echo "== ARP degrade regression checks =="

echo "[1/4] Handshake fallback must fail closed (cursor_resume: false)..."
INIT_START_LINE="$(grep -n "async initialize(): Promise<InitializeResponse>" "$CLIENT_FILE" | head -n1 | cut -d: -f1)"
if [[ -z "${INIT_START_LINE:-}" ]]; then
  echo "FAIL: could not locate initialize() in $CLIENT_FILE"
  exit 1
fi
INIT_END_LINE=$((INIT_START_LINE + 40))
INIT_BLOCK="$(sed -n "${INIT_START_LINE},${INIT_END_LINE}p" "$CLIENT_FILE")"
if ! printf '%s\n' "$INIT_BLOCK" | grep -q "cursor_resume: false"; then
  echo "FAIL: initialize() catch does not set cursor_resume: false in $CLIENT_FILE"
  exit 1
fi

echo "[2/4] App handshake mismatch must disable cursor resume..."
if ! grep -q "Protocol mismatch (ui=" "$APP_FILE"; then
  echo "FAIL: missing protocol mismatch guard log in $APP_FILE"
  exit 1
fi
if ! grep -q "setRuntimeSupportsCursorResume(false);" "$APP_FILE"; then
  echo "FAIL: missing mismatch fallback setRuntimeSupportsCursorResume(false) in $APP_FILE"
  exit 1
fi

echo "[3/4] Incremental sync failure must trip session circuit breaker..."
if ! grep -q "Incremental sync failed; disabling cursor resume for this session." "$APP_FILE"; then
  echo "FAIL: missing incremental sync failure warning in $APP_FILE"
  exit 1
fi
if ! grep -q "listEventsSince returned a non-advancing cursor" "$APP_FILE"; then
  echo "FAIL: missing non-advancing listEventsSince cursor guard in $APP_FILE"
  exit 1
fi
if ! grep -q "setRuntimeSupportsCursorResume(false);" "$APP_FILE"; then
  echo "FAIL: incremental sync catch is not disabling cursor resume in $APP_FILE"
  exit 1
fi

echo "[4/4] Build must still pass..."
npm run build >/dev/null

echo "PASS: ARP degrade regression checks passed."
