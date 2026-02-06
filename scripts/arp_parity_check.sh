#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== ARP parity preflight =="
echo "Running compile checks..."
npm run build
(cd src-tauri && cargo check -q)
bash scripts/arp_degrade_regression_check.sh

echo
echo "== Manual parity checklist (run with VITE_ARP_CLIENT=1) =="
cat <<'EOF'
[ ] Open app and confirm thread list loads.
[ ] Create a thread; verify workspace path updates in thread metadata.
[ ] Send a prompt and confirm streaming content appears and final assistant message persists.
[ ] Trigger a tool call requiring approval; approve and deny in separate runs.
[ ] Cancel an in-flight run and confirm UI returns to idle without stale spinner.
[ ] Switch threads and back; verify new messages and tool cards stay consistent.
[ ] Restart app; verify recent messages/tool calls still render and no duplicate rows appear.
EOF

echo
echo "Preflight complete."
