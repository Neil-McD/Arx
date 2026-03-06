#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTH_HTTP_FILE="convex/httpAuth.ts"
VOICE_HTTP_FILE="convex/httpVoice.ts"

echo "== Journey smoke gate =="
echo "UTC: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Commit: $(git rev-parse HEAD)"
echo "Scope: $ROOT_DIR"

SKIP_IDEMPOTENCY_GUARDS="${JOURNEY_SKIP_IDEMPOTENCY_GUARDS:-0}"
if [[ "$SKIP_IDEMPOTENCY_GUARDS" == "1" ]]; then
  TOTAL_STEPS=6
else
  TOTAL_STEPS=8
fi
CURRENT_STEP=1

run_step() {
  local label="$1"
  shift
  echo "[${CURRENT_STEP}/${TOTAL_STEPS}] ${label}..."
  "$@"
  CURRENT_STEP=$((CURRENT_STEP + 1))
}

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  rg -F -q "$pattern" "$file" || {
    echo "FAIL: $message"
    exit 1
  }
}

forbid_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if rg -F -q "$pattern" "$file"; then
    echo "FAIL: $message"
    rg -n -F "$pattern" "$file" || true
    exit 1
  fi
}

check_auth_journey_contracts() {
  require_contains "shared/cloudAuthFlow.ts" "export async function beginGoogleCloudSignIn" \
    "auth journey missing cloud sign-in entrypoint"
  require_contains "shared/cloudAuthFlow.ts" "readConvexUrl()" \
    "auth journey missing Convex runtime URL gate in sign-in flow"
  require_contains "shared/cloudAuthFlow.ts" "export async function revokeCloudSessionRemote" \
    "auth journey missing remote sign-out entrypoint"
  require_contains "shared/cloudAuthFlow.ts" "export async function expireCloudSessionFailClosed" \
    "auth journey missing fail-closed expiry path"
  require_contains "shared/cloudAuthCore.ts" "CLOUD_RUNTIME_AUTH_BEGIN_GOOGLE_PATH" \
    "auth journey missing runtime auth begin route marker"
  require_contains "shared/cloudAuthCore.ts" "CLOUD_RUNTIME_AUTH_EXCHANGE_PKCE_PATH" \
    "auth journey missing runtime auth PKCE exchange marker"
  require_contains "shared/cloudAuthCore.ts" "CLOUD_RUNTIME_AUTH_REFRESH_PATH" \
    "auth journey missing runtime auth refresh marker"
  require_contains "shared/cloudAuthCore.ts" "CLOUD_RUNTIME_AUTH_OTP_PATH" \
    "auth journey missing runtime auth OTP marker"
  require_contains "shared/cloudAuthCore.ts" "CLOUD_RUNTIME_AUTH_LOGOUT_PATH" \
    "auth journey missing runtime auth logout marker"
  require_contains "$AUTH_HTTP_FILE" "path: \"/runtime/auth_begin_google_sign_in\"" \
    "auth journey missing runtime auth begin route"
  require_contains "$AUTH_HTTP_FILE" "path: \"/runtime/auth_exchange_pkce_code\"" \
    "auth journey missing runtime auth PKCE exchange route"
  require_contains "$AUTH_HTTP_FILE" "path: \"/runtime/auth_refresh_session\"" \
    "auth journey missing runtime auth refresh route"
  require_contains "$AUTH_HTTP_FILE" "path: \"/runtime/auth_send_magic_link_otp\"" \
    "auth journey missing runtime auth OTP route"
  require_contains "$AUTH_HTTP_FILE" "path: \"/runtime/auth_logout_session\"" \
    "auth journey missing runtime auth logout route"
  forbid_contains "shared/cloudAuthCore.ts" "CLOUD_AUTH_V1_SEGMENT" \
    "auth journey must not restore legacy auth path constants"
  forbid_contains "shared/cloudAuthCore.ts" "buildCloudAuthUrl(" \
    "auth journey must not restore direct auth URL builder helper"
  forbid_contains "shared/cloudAuthCore.ts" "callCloudAuthEndpoint(" \
    "auth journey must not restore direct auth endpoint transport helper"
  forbid_contains "shared/cloudAuthCore.ts" "callCloudAuthEndpointJson(" \
    "auth journey must not restore direct auth endpoint JSON helper"
  require_contains "shared/usePendingInviteJoinController.ts" "requestJoinPendingInvite" \
    "invite journey missing signed-out join intent request"
  require_contains "shared/usePendingInviteJoinController.ts" "markPendingInviteJoined" \
    "invite journey missing joined marker path"
}

check_billing_journey_contracts() {
  require_contains "convex/billing.ts" "export const startBuilderCheckout = mutation({" \
    "billing journey missing builder checkout start mutation"
  require_contains "convex/billing.ts" "export const startPublicCommunityCheckout = mutation({" \
    "billing journey missing public checkout start mutation"
  require_contains "convex/billing.ts" "export const finalizeCheckoutSession = query({" \
    "billing journey missing checkout finalize query"
  require_contains "convex/billing.ts" "export const redeemPurchaseClaim = mutation({" \
    "billing journey missing claim redeem mutation"
  require_contains "convex/billing.ts" "export const redeemPendingPurchaseClaims = mutation({" \
    "billing journey missing pending-claim recovery mutation"
  require_contains "shared/useCheckoutFinalizeController.ts" "billing:finalizeCheckoutSession" \
    "billing journey missing finalize callsite in shared controller"
  require_contains "shared/pay_first.ts" "billing:redeemPurchaseClaim" \
    "billing journey missing purchase-claim redeem callsite"
}

check_voice_journey_contracts() {
  require_contains "$VOICE_HTTP_FILE" "path: \"/runtime/voice_transcribe\"" \
    "voice journey missing runtime voice_transcribe route"
  require_contains "$VOICE_HTTP_FILE" "ARX_VOICE_TRANSCRIBE_ENABLED" \
    "voice journey missing runtime enable/disable gate"
  require_contains "$VOICE_HTTP_FILE" "transcribeWithOpenAi" \
    "voice journey missing primary transcription path"
  require_contains "$VOICE_HTTP_FILE" "transcribeWithGroqFallback" \
    "voice journey missing fallback transcription path"
  require_contains "shared/cloudAuthCore.ts" "buildConvexRuntimeUrl(convexUrl, \"/runtime/voice_transcribe\")" \
    "voice journey missing shared Convex voice transport call"
  require_contains "shared/useWebVoiceInputController.ts" "transcribeCloudVoice({" \
    "voice journey missing web transcription callsite"
  require_contains "src/controllers/desktop/useDesktopVoiceInputController.ts" "transcribeCloudVoice({" \
    "voice journey missing desktop transcription callsite"
}

run_voice_journey_smoke() {
  check_voice_journey_contracts
  cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q native_voice::native_voice_capture_tests::i16_mix_down_averages_channels
}

TAURI_CARGO_MANIFEST="src-tauri/Cargo.toml"
if ! command -v cargo >/dev/null 2>&1; then
  echo "FAIL: cargo is required for journey smoke tests."
  exit 1
fi

run_step "Auth + invite journey contract markers" check_auth_journey_contracts
if [[ "$SKIP_IDEMPOTENCY_GUARDS" != "1" ]]; then
  run_step "Thread/turn server idempotency guard" bash scripts/runtime_turn_contract_guard.sh
  run_step "Thread/turn client idempotency guard" bash scripts/runtime_turn_client_idempotency_guard.sh
fi
run_step "Thread lens snapshot smoke test" cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q thread_context_snapshot_tests::next_run_snapshot_reflects_new_lens_after_context_switch
run_step "Cancelled-run lens-retarget smoke test" cargo test --manifest-path "$TAURI_CARGO_MANIFEST" -q thread_context_snapshot_tests::cancelled_run_then_lens_retarget_uses_new_lens_on_next_run_snapshot
run_step "Community turn-path smoke tests" bash scripts/reliability_turn_path_smoke_check.sh
run_step "Billing journey contract markers" check_billing_journey_contracts
run_step "Voice journey contracts + native capture smoke" run_voice_journey_smoke

echo "PASS: journey smoke gate passed."
