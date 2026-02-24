#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MATRIX_DOC="docs/auth-money-access-matrix.md"
MODEL_CATALOG="shared/modelCatalog.ts"
LANE_RESOLVER="shared/inferenceLaneResolver.ts"
WEB_TURN_RUNNER="shared/useWebTurnRunnerController.ts"
DESKTOP_CLOUD_CHAT="src/services/thread/createDesktopCloudChatThreadApi.ts"
DESKTOP_RUNTIME="src-tauri/src/main.rs"
AUTH_CORE="shared/supabaseAuthCore.ts"
AGENT_TURN="supabase/functions/agent_turn/index.ts"
PUBLIC_TURN="supabase/functions/public_turn/index.ts"
PLATFORM_AGENT_INFER="supabase/functions/platform_agent_infer/index.ts"
RUNTIME_TURN="supabase/functions/runtime_turn/index.ts"
PUBLIC_FUNNEL_FN="supabase/functions/public_funnel/index.ts"
CHECKOUT_START_FN="supabase/functions/checkout_start/index.ts"
CHECKOUT_FINALIZE_FN="supabase/functions/checkout_finalize/index.ts"
STRIPE_WEBHOOK_FN="supabase/functions/stripe_webhook/index.ts"
MIGRATIONS_DIR="supabase/migrations"
THREAD_DOMAIN_RESOLVER="shared/threadService/domainResolver.ts"

require_migration_pattern() {
  local pattern="$1"
  local message="$2"
  if ! rg -n --glob '*.sql' "$pattern" "$MIGRATIONS_DIR" >/dev/null; then
    echo "FAIL: $message"
    exit 1
  fi
}

echo "== Auth + money + access matrix contract checks =="

echo "[1/22] Canonical matrix doc must exist..."
test -f "$MATRIX_DOC" || { echo "FAIL: missing $MATRIX_DOC"; exit 1; }

echo "[2/22] Matrix doc must define irreducible inputs/outputs and behavior table..."
grep -q "Irreducible Contract" "$MATRIX_DOC" || { echo "FAIL: matrix missing irreducible contract section"; exit 1; }
grep -q "| Surface | Lane | Auth | Tier | Model class | requires_tools | Runtime lane |" "$MATRIX_DOC" || {
  echo "FAIL: matrix behavior table header missing"
  exit 1
}

echo "[3/22] Shared model catalog must include canonical free+paid baseline..."
for id in \
  "gpt-oss-120b-free" \
  "deepseek-r1-free" \
  "gpt-5.2" \
  "sonnet-4.6" \
  "opus-4.6" \
  "gemini-3-flash" \
  "gemini-3.1-pro" \
  "grok-4.1"; do
  grep -q "\"$id\"" "$MODEL_CATALOG" || { echo "FAIL: missing model '$id' in model catalog"; exit 1; }
done

echo "[4/22] Shared lane resolver must enforce desktop ChatGPT-first + free/public + paid/platform..."
grep -q 'export function resolveCloudInferenceLane' "$LANE_RESOLVER" || {
  echo "FAIL: missing resolveCloudInferenceLane"
  exit 1
}
grep -q 'isChatgptEligibleModelAlias' "$LANE_RESOLVER" || {
  echo "FAIL: lane resolver missing ChatGPT eligibility helper"
  exit 1
}
grep -q 'surface === "desktop" && hasChatgptAuth && isChatgptEligibleModelAlias(params.modelId)' "$LANE_RESOLVER" || {
  echo "FAIL: lane resolver missing desktop ChatGPT-first gate"
  exit 1
}
grep -q 'return isFreeModelId(params.modelId, allowlist) ? "public" : "platform";' "$LANE_RESOLVER" || {
  echo "FAIL: lane resolver contract changed"
  exit 1
}

echo "[5/22] Web chat inference must keep dual endpoint wiring..."
grep -q '/functions/v1/public_turn' "$WEB_TURN_RUNNER" || { echo "FAIL: web runner missing public_turn"; exit 1; }
grep -q '/functions/v1/agent_turn' "$WEB_TURN_RUNNER" || { echo "FAIL: web runner missing agent_turn"; exit 1; }

echo "[6/22] Web authenticated lane must support runtime_turn wiring..."
grep -q '/functions/v1/runtime_turn' "$WEB_TURN_RUNNER" || { echo "FAIL: web runner missing runtime_turn wiring"; exit 1; }

echo "[7/22] Desktop cloud chat must use shared lane resolver and chatgpt/platform/public routing..."
grep -qE 'resolveCloudInferenceLane|resolveDesktopCloudInferenceExecutionPlan' "$DESKTOP_CLOUD_CHAT" || {
  echo "FAIL: desktop cloud chat not using shared lane resolver"
  exit 1
}
grep -q 'buildChatgptLaneMessages' "$DESKTOP_CLOUD_CHAT" || {
  echo "FAIL: desktop cloud chat missing ChatGPT lane message assembly"
  exit 1
}
grep -q 'chatgptCloudTurn' "$DESKTOP_CLOUD_CHAT" || {
  echo "FAIL: desktop cloud chat missing ChatGPT lane adapter"
  exit 1
}
grep -q '/functions/v1/runtime_turn' "$DESKTOP_CLOUD_CHAT" || {
  echo "FAIL: desktop cloud chat missing runtime_turn wiring"
  exit 1
}
grep -q '/functions/v1/public_turn' "$DESKTOP_CLOUD_CHAT" || { echo "FAIL: desktop cloud chat missing public_turn"; exit 1; }
grep -q '/functions/v1/agent_turn' "$DESKTOP_CLOUD_CHAT" || { echo "FAIL: desktop cloud chat missing agent_turn"; exit 1; }

echo "[8/22] Desktop thread domain contract must remain chat:cloud and agent:local only..."
grep -q 'chat:cloud' "$THREAD_DOMAIN_RESOLVER" || { echo "FAIL: missing chat:cloud domain"; exit 1; }
grep -q 'agent:local' "$THREAD_DOMAIN_RESOLVER" || { echo "FAIL: missing agent:local domain"; exit 1; }

echo "[9/22] Desktop local runtime must keep chatgpt/platform/public lane chooser + endpoints..."
grep -q 'fn first_desktop_inference_lane' "$DESKTOP_RUNTIME" || { echo "FAIL: missing first_desktop_inference_lane"; exit 1; }
grep -q 'fn next_desktop_inference_lane' "$DESKTOP_RUNTIME" || { echo "FAIL: missing next_desktop_inference_lane"; exit 1; }
grep -q 'DesktopInferenceLane::Chatgpt' "$DESKTOP_RUNTIME" || { echo "FAIL: missing ChatGPT lane in desktop runtime"; exit 1; }
grep -q 'openai.responses.json' "$DESKTOP_RUNTIME" || { echo "FAIL: missing ChatGPT request format path"; exit 1; }
grep -q 'ChatGPT-Account-Id' "$DESKTOP_RUNTIME" || { echo "FAIL: missing ChatGPT account header path"; exit 1; }
grep -q 'functions/v1/platform_agent_infer' "$DESKTOP_RUNTIME" || { echo "FAIL: missing platform_agent_infer endpoint"; exit 1; }
grep -q 'functions/v1/public_turn' "$DESKTOP_RUNTIME" || { echo "FAIL: missing public_turn endpoint"; exit 1; }
grep -q 'has_platform_lane_now' "$DESKTOP_RUNTIME" || {
  echo "FAIL: missing platform lane availability recompute"
  exit 1
}
grep -q 'has_public_lane_now' "$DESKTOP_RUNTIME" || {
  echo "FAIL: missing public lane availability recompute"
  exit 1
}

echo "[10/22] Desktop local runtime must keep free-model public-lane enforcement..."
grep -q 'selected_model_is_public_free' "$DESKTOP_RUNTIME" || { echo "FAIL: free-model lane flag missing"; exit 1; }
grep -q 'public_available_for_run' "$DESKTOP_RUNTIME" || {
  echo "FAIL: missing public_available_for_run branch"
  exit 1
}
grep -q 'selected_model_is_public_free' "$DESKTOP_RUNTIME" || {
  echo "FAIL: free-model public lane contract changed"
  exit 1
}

echo "[11/22] Private inference endpoints must verify auth and enforce strict CORS..."
grep -q 'withStrictCors' "$AGENT_TURN" || { echo "FAIL: agent_turn missing strict CORS"; exit 1; }
grep -q 'requireVerifiedUserId' "$AGENT_TURN" || { echo "FAIL: agent_turn missing bearer verification"; exit 1; }
grep -q 'withStrictCors' "$PLATFORM_AGENT_INFER" || { echo "FAIL: platform_agent_infer missing strict CORS"; exit 1; }
grep -q 'requireVerifiedUserId' "$PLATFORM_AGENT_INFER" || { echo "FAIL: platform_agent_infer missing bearer verification"; exit 1; }

echo "[12/22] Runtime turn endpoint must enforce auth + daytona lane plumbing..."
grep -q 'withStrictCors' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing strict CORS"; exit 1; }
grep -q 'requireVerifiedUserId' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing bearer verification"; exit 1; }
grep -q 'ensureDaytonaSandbox' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing daytona sandbox resolver"; exit 1; }
grep -q 'executeDaytonaLane' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing daytona lane executor"; exit 1; }
grep -q 'daytona_probe_finished' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing daytona probe event"; exit 1; }
grep -q 'DAYTONA_API_KEY' "$RUNTIME_TURN" || { echo "FAIL: runtime_turn missing Daytona secret requirement"; exit 1; }

echo "[13/22] Public inference endpoint must remain public + rate-limited + model-gated..."
grep -q 'withCors' "$PUBLIC_TURN" || { echo "FAIL: public_turn missing public CORS"; exit 1; }
grep -q 'edgeRateLimitAllow' "$PUBLIC_TURN" || { echo "FAIL: public_turn missing rate limit"; exit 1; }
grep -q 'model_not_allowed' "$PUBLIC_TURN" || { echo "FAIL: public_turn missing model_not_allowed guard"; exit 1; }

echo "[14/22] Platform inference entitlement and quota errors must stay explicit..."
grep -q 'platform_inference_not_allowed' "$AGENT_TURN" || { echo "FAIL: agent_turn missing plan gating error"; exit 1; }
grep -q 'consumePlatformInferenceStandard' "$AGENT_TURN" || { echo "FAIL: agent_turn missing platform quota consumption"; exit 1; }
grep -q 'platform_inference_not_allowed' "$PLATFORM_AGENT_INFER" || { echo "FAIL: platform_agent_infer missing plan gating error"; exit 1; }
grep -q 'consumePlatformInferenceStandard' "$PLATFORM_AGENT_INFER" || { echo "FAIL: platform_agent_infer missing platform quota consumption"; exit 1; }
grep -q 'resolvePlatformInferenceTarget' "$AGENT_TURN" || {
  echo "FAIL: agent_turn must use shared resolvePlatformInferenceTarget"
  exit 1
}
grep -q 'resolvePlatformInferenceTarget' "$PLATFORM_AGENT_INFER" || {
  echo "FAIL: platform_agent_infer must use shared resolvePlatformInferenceTarget"
  exit 1
}
if rg -q 'platformProviderEnvKey|platformOpenAiCompatibleBaseUrl' "$AGENT_TURN" "$PLATFORM_AGENT_INFER"; then
  echo "FAIL: local provider key/base-url branching reintroduced in endpoint handlers"
  exit 1
fi

echo "[15/22] Auth core must not force-expire session from functions 401/403 alone..."
grep -q 'if (isFunctionsSurface) return false;' "$AUTH_CORE" || {
  echo "FAIL: functions-surface auth expiry guard missing"
  exit 1
}
if rg -n 'isFunctionsBearerJwtFailure\(finalFailure\)\) return await expireSession\(\);' "$AUTH_CORE" >/dev/null; then
  echo "FAIL: direct function auth failure -> local session expiry path reintroduced"
  exit 1
fi
grep -q 'const verifiedSession = await ensureSupabaseSessionForAuthenticatedSend({' "$AUTH_CORE" || {
  echo "FAIL: functions lane must verify session with /auth/v1/user before local expiry"
  exit 1
}

echo "[16/22] Canonical product state RPC must exist and expose plan+inference caps..."
require_migration_pattern 'get_my_product_state' "missing get_my_product_state RPC"
require_migration_pattern 'platform_inference_standard_cap' "product state missing platform inference cap"
require_migration_pattern 'max_communities' "product state missing max_communities"

echo "[17/22] Platform inference quota RPC must enforce free=0, builder/pro>0..."
require_migration_pattern 'platform_inference_standard_cap_for_builder_tier' "missing platform_inference_standard_cap_for_builder_tier RPC"
require_migration_pattern "when lower\\(coalesce\\(p_tier, ''\\)\\) = 'pro' then 2000" "missing pro cap in platform inference quota RPC"
require_migration_pattern "when lower\\(coalesce\\(p_tier, ''\\)\\) = 'builder' then 300" "missing builder cap in platform inference quota RPC"
require_migration_pattern "else 0" "missing free-tier zero cap"

echo "[18/22] Community creation must remain builder-tier gated..."
require_migration_pattern 'max_communities_for_builder_tier' "missing max_communities_for_builder_tier"
require_migration_pattern 'create_community' "missing create_community builder gate contract"

echo "[19/22] Public funnel must keep canonical join_mode contract..."
require_migration_pattern 'get_public_community_funnel_by_slug' "missing public funnel resolver RPC"
require_migration_pattern "v_join_mode := 'checkout'" "missing checkout join_mode branch"
require_migration_pattern "v_join_mode := 'request_access'" "missing request_access join_mode branch"
require_migration_pattern "v_join_mode := 'join_free'" "missing join_free join_mode branch"

echo "[20/22] Free join + request access RPCs must remain explicit..."
require_migration_pattern 'join_public_community' "missing join_public_community RPC"
require_migration_pattern 'request_community_access_by_slug' "missing request_community_access_by_slug RPC"

echo "[21/22] Money rails must keep funnel->checkout->finalize->webhook chain..."
grep -q 'checkout_start' "$PUBLIC_FUNNEL_FN" || { echo "FAIL: public_funnel not delegating checkout_start"; exit 1; }
grep -q 'createStripeCheckoutSession' "$CHECKOUT_START_FN" || { echo "FAIL: checkout_start missing session create"; exit 1; }
grep -q 'insertClaim' "$CHECKOUT_FINALIZE_FN" || { echo "FAIL: checkout_finalize missing claim issuance"; exit 1; }
grep -q 'upsertProviderEvent' "$STRIPE_WEBHOOK_FN" || { echo "FAIL: stripe_webhook missing event idempotency upsert"; exit 1; }
grep -q 'handleStripeEvent' "$STRIPE_WEBHOOK_FN" || { echo "FAIL: stripe_webhook missing event handler dispatch"; exit 1; }

echo "[22/22] Deployment manifest must include runtime_turn..."
grep -q '"slug": "runtime_turn"' supabase/functions/deployment-manifest.json || {
  echo "FAIL: deployment manifest missing runtime_turn"
  exit 1
}

echo "PASS: auth + money + access matrix checks passed."
