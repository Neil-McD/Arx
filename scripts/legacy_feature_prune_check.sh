#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Legacy feature prune checks =="

echo "[1/1] src-tauri Cargo features should not include legacy_orchestrator_helpers..."
if rg -q "legacy_orchestrator_helpers" src-tauri/Cargo.toml; then
  echo "FAIL: src-tauri/Cargo.toml still contains legacy_orchestrator_helpers"
  exit 1
fi

echo "PASS: legacy feature prune checks passed."
