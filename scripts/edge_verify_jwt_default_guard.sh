#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST_PATH="$ROOT_DIR/supabase/functions/deployment-manifest.json"

# Public/webhook endpoints that are intentionally unauthenticated.
PUBLIC_VERIFY_JWT_FALSE_ALLOWLIST=(
  "checkout_start"
  "checkout_finalize"
  "public_discover"
  "public_funnel"
  "public_turn"
  "stripe_webhook"
)

# Protected endpoints that intentionally rely on strict in-function bearer verification.
# This is a fail-safe fallback mode when edge verify_jwt is unreliable.
MANUAL_AUTH_VERIFY_JWT_FALSE_ALLOWLIST=(
  "agent_turn"
  "builder_billing_portal"
  "builder_checkout_start"
  "community_research"
  "connect_onboard_start"
  "daytona_sync_statuses"
  "platform_agent_infer"
  "runtime_turn"
  "voice_transcribe"
)

# Auth-required endpoints must keep manual auth verification as defense in depth.
PROTECTED_FUNCTIONS=(
  "agent_turn"
  "builder_billing_portal"
  "builder_checkout_start"
  "community_research"
  "connect_onboard_start"
  "daytona_sync_statuses"
  "platform_agent_infer"
  "runtime_turn"
  "voice_transcribe"
)

contains_item() {
  local needle="$1"
  shift
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

echo "== Edge verify_jwt default guard =="

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "FAIL: missing deployment manifest at $MANIFEST_PATH"
  exit 1
fi

echo "[1/4] Manifest verify_jwt=false entries must stay inside explicit allowlists..."
PUBLIC_ALLOWLIST_CSV="$(IFS=,; echo "${PUBLIC_VERIFY_JWT_FALSE_ALLOWLIST[*]}")"
MANUAL_ALLOWLIST_CSV="$(IFS=,; echo "${MANUAL_AUTH_VERIFY_JWT_FALSE_ALLOWLIST[*]}")"
MANIFEST_PATH="$MANIFEST_PATH" PUBLIC_ALLOWLIST_CSV="$PUBLIC_ALLOWLIST_CSV" MANUAL_ALLOWLIST_CSV="$MANUAL_ALLOWLIST_CSV" node <<'NODE'
const fs = require("fs");

const manifestPath = process.env.MANIFEST_PATH;
const allowCsv = process.env.PUBLIC_ALLOWLIST_CSV ?? "";
const manualCsv = process.env.MANUAL_ALLOWLIST_CSV ?? "";
const allow = new Set(allowCsv.split(",").map((s) => s.trim()).filter(Boolean));
for (const slug of manualCsv.split(",").map((s) => s.trim()).filter(Boolean)) {
  allow.add(slug);
}

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`unable to parse deployment manifest (${error.message})`);
}

const active = Array.isArray(manifest?.active_functions) ? manifest.active_functions : null;
if (!active || active.length === 0) {
  fail("deployment manifest must contain a non-empty active_functions array");
}

const seen = new Set();
const falseSlugs = [];
for (const entry of active) {
  const slug = String(entry?.slug ?? "").trim();
  if (!slug) fail("manifest contains an entry with empty slug");
  if (seen.has(slug)) fail(`manifest contains duplicate slug '${slug}'`);
  seen.add(slug);

  if (typeof entry?.verify_jwt !== "boolean") {
    fail(`manifest entry '${slug}' must set boolean verify_jwt`);
  }
  if (entry.verify_jwt === false) falseSlugs.push(slug);
}

const unexpected = falseSlugs.filter((slug) => !allow.has(slug));
if (unexpected.length > 0) {
  fail(`verify_jwt=false is only allowed for explicit allowlists; found: ${unexpected.join(", ")}`);
}

console.log(
  `PASS: manifest verify_jwt posture is allowlisted (false slugs: ${falseSlugs.length ? falseSlugs.sort().join(", ") : "none"}).`,
);
NODE

echo "[2/4] Function configs must not set verify_jwt=false outside allowlists..."
false_configs=()
for config in "$ROOT_DIR"/supabase/functions/*/config.toml; do
  slug="$(basename "$(dirname "$config")")"
  verify_jwt="$(sed -nE 's/^[[:space:]]*verify_jwt[[:space:]]*=[[:space:]]*(true|false)[[:space:]]*$/\1/p' "$config" | head -n1)"
  if [[ -z "$verify_jwt" ]]; then
    echo "FAIL: missing verify_jwt assignment in $config"
    exit 1
  fi
  if [[ "$verify_jwt" == "false" ]]; then
    if ! contains_item "$slug" "${PUBLIC_VERIFY_JWT_FALSE_ALLOWLIST[@]}" &&
      ! contains_item "$slug" "${MANUAL_AUTH_VERIFY_JWT_FALSE_ALLOWLIST[@]}"; then
      echo "FAIL: $config sets verify_jwt=false but '$slug' is not in an explicit allowlist"
      exit 1
    fi
    false_configs+=("$slug")
  fi
done
echo "PASS: config verify_jwt posture is allowlisted (false slugs: ${false_configs[*]:-none})."

echo "[3/4] Auth-protected endpoints must keep strict CORS..."
for slug in "${PROTECTED_FUNCTIONS[@]}"; do
  file="$ROOT_DIR/supabase/functions/$slug/index.ts"
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing protected function source $file"
    exit 1
  fi
  if ! rg -n "withStrictCors\\(" "$file" >/dev/null; then
    echo "FAIL: protected function '$slug' must use withStrictCors"
    exit 1
  fi
done
echo "PASS: strict CORS is enforced across protected endpoints."

echo "[4/4] Auth-protected endpoints must keep manual bearer verification (defense in depth)..."
for slug in "${PROTECTED_FUNCTIONS[@]}"; do
  file="$ROOT_DIR/supabase/functions/$slug/index.ts"
  if ! rg -n "requireVerifiedUserId\\(" "$file" >/dev/null; then
    echo "FAIL: protected function '$slug' must call requireVerifiedUserId"
    exit 1
  fi
done
echo "PASS: protected endpoints keep manual auth verification."

echo "PASS: edge verify_jwt default guard passed."
