#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Alpha hardening automated gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

echo "[1/9] Build desktop/web root app..."
npm run -s build

echo "[2/9] Build web app..."
npm run -s build --prefix apps/web

echo "[3/9] Verify web bootstrap render health..."
WEB_BOOTSTRAP_SKIP_BUILD=1 bash scripts/web_bootstrap_smoke_check.sh

echo "[4/9] Verify join/gate public funnel routing..."
bash scripts/public_funnel_controller_regression_check.sh

echo "[5/9] Verify membership/join review pathways..."
bash scripts/community_members_review_controller_regression_check.sh

echo "[6/9] Verify thread lens switching provenance..."
bash scripts/thread_context_e2e_matrix_check.sh

echo "[7/9] Verify billing + checkout finalize pathways..."
bash scripts/billing_funnel_controller_regression_check.sh
bash scripts/community_create_controller_regression_check.sh

echo "[8/9] Verify voice start/stop/transcribe surface wiring..."
bash scripts/voice_surface_regression_check.sh

echo "[9/9] Verify full community core matrix..."
bash scripts/community_core_check.sh

echo "PASS: alpha hardening automated gate passed."
