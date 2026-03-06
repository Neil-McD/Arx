#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== No compat RPC primitive guard =="

PATTERN='invokeRpcJson|invokeRestAuth|invokeCloudRpcViaRestAuth|buildCloudRestRpcUrl|get_my_product_state|dev_set_my_builder_tier|buildCloudAuthUserUrl|probeCloudAuthSession'
TARGETS=(
  src
  apps
  shared
  src-tauri
)

echo "[1/2] Scanning runtime/product paths for removed compat-RPC primitives..."
if rg -n --hidden -S "$PATTERN" "${TARGETS[@]}"; then
  echo "FAIL: removed compat-RPC primitive reintroduced in runtime/product code."
  exit 1
fi

echo "[2/2] Guard passed."
echo "PASS: compat-RPC primitives remain deleted from runtime/product code."
