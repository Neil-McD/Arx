#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Model routing legacy fallback prune checks =="

echo "[1/3] Desktop runtime must not contain legacy env-map or OpenAI alias inference fallback..."
if rg -q "load_platform_model_map|resolve_platform_model_for_alias\(|infer_openai_model_ref_from_alias|model_alias_looks_openai|PLATFORM_MODEL_MAP_JSON|ARX_PLATFORM_MODEL_REF|OPENROUTER_PLATFORM_MODEL_ID" src-tauri/src/main.rs; then
  echo "FAIL: src-tauri/src/main.rs still contains legacy model routing fallback symbols"
  exit 1
fi

echo "[2/3] Edge platform inference must resolve models from registry only..."
if rg -q "resolvePlatformModelForAliasLegacy|loadPlatformModelMap|PLATFORM_MODEL_MAP_JSON|ARX_PLATFORM_MODEL_REF|OPENROUTER_PLATFORM_MODEL_ID" supabase/functions/platform_agent_infer/index.ts supabase/functions/_shared/platform_model_routing.ts; then
  echo "FAIL: edge model routing still contains legacy fallback symbols"
  exit 1
fi

echo "[3/3] Both cloud runtimes should enforce explicit registry config when alias is unresolved..."
if ! rg -q "platform model not configured for" supabase/functions/agent_turn/index.ts supabase/functions/platform_agent_infer/index.ts; then
  echo "FAIL: missing strict registry error path for unresolved model aliases"
  exit 1
fi

echo "PASS: model routing legacy fallback prune checks passed."
