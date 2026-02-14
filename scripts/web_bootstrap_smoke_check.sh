#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Web bootstrap smoke checks =="

if [[ "${WEB_BOOTSTRAP_SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building apps/web..."
  npm run -s build --prefix apps/web
fi

node scripts/web_bootstrap_smoke_check.mjs
