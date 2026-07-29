#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

. "$ROOT_DIR/scripts/guard_rg_compat.sh"

echo "== No compat RPC primitive guard =="

PATTERN='invokeRpcJson|invokeRestAuth|invokeCloudRpcViaRestAuth|buildCloudRestRpcUrl|get_my_product_state|dev_set_my_builder_tier|dev_set_my_account_tier|buildCloudAuthUserUrl|probeCloudAuthSession'
TARGETS=(
  apps
  shared
)

echo "[1/2] Scanning runtime/product paths for removed compat-RPC primitives..."
guard_rg_assert_absent \
  "removed compat-RPC primitive in runtime/product code" \
  -n --hidden -S "$PATTERN" "${TARGETS[@]}"

echo "[2/2] Guard passed."
echo "PASS: compat-RPC primitives remain deleted from runtime/product code."
