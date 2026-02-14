#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUST_MAIN="src-tauri/src/main.rs"
AGENT_TURN="supabase/functions/agent_turn/index.ts"
CAPABILITIES="shared/capabilities.ts"
PROVIDER_KEY_FN="supabase/functions/provider_key/index.ts"

echo "== BYOK surface prune checks =="

echo "[1/4] Desktop runtime should not expose provider-key commands..."
if rg -q "set_provider_key_cmd|clear_provider_key_cmd|has_provider_key_cmd|get_provider_key_cmd" "$RUST_MAIN"; then
  echo "FAIL: desktop runtime still exposes provider-key commands"
  exit 1
fi

echo "[2/4] Agent turn should not emit BYOK compatibility fields..."
if rg -q "byok_allowed|has_byok_key|byok_inference_removed" "$AGENT_TURN"; then
  echo "FAIL: agent_turn still contains BYOK compatibility fields"
  exit 1
fi

echo "[3/4] Shared access policy should not contain BYOK toggles..."
if rg -q "allowByokLocalStore|allowByokCloudStore|BYOK_ENABLED" "$CAPABILITIES"; then
  echo "FAIL: shared access policy still contains BYOK toggles"
  exit 1
fi

echo "[4/4] Provider-key edge function should be removed..."
if [[ -f "$PROVIDER_KEY_FN" ]]; then
  echo "FAIL: provider_key edge function still exists"
  exit 1
fi

echo "PASS: BYOK surface prune checks passed."
