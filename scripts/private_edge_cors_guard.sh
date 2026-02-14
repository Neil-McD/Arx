#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Private edge CORS guard =="

private_routes=(
  "supabase/functions/agent_turn/index.ts"
  "supabase/functions/platform_agent_infer/index.ts"
  "supabase/functions/builder_checkout_start/index.ts"
  "supabase/functions/builder_billing_portal/index.ts"
  "supabase/functions/connect_onboard_start/index.ts"
)

for file in "${private_routes[@]}"; do
  echo "Checking $file"

  if ! rg -q "withStrictCors\\(" "$file"; then
    echo "FAIL: $file must use withStrictCors for private route CORS."
    exit 1
  fi

  if rg -q "withCors\\(" "$file"; then
    echo "FAIL: $file still uses withCors; private routes must be strict."
    exit 1
  fi
done

echo "PASS: private edge CORS guard checks passed."
