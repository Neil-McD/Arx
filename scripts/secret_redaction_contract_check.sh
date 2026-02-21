#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Secret redaction contract check =="
cargo test --manifest-path src-tauri/Cargo.toml -q secret_redaction_
