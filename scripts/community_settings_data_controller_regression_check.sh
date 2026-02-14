#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunitySettingsDataController.ts"
WEB_SETTINGS_ACCESS_HOOK="apps/web/src/controllers/useWebCommunitySettingsAccessLifecycle.ts"

echo "== Community settings data controller regression checks =="

echo "[1/8] App shells should import shared settings data controller..."
if ! grep -q 'from "../shared/useCommunitySettingsDataController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunitySettingsDataController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunitySettingsDataController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunitySettingsDataController"
  exit 1
fi

echo "[2/8] Shared settings data controller file should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunitySettingsDataController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunitySettingsDataController export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared settings data controller..."
if ! grep -q "useCommunitySettingsDataController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunitySettingsDataController"
  exit 1
fi
if ! grep -q "useCommunitySettingsDataController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunitySettingsDataController"
  exit 1
fi

echo "[4/8] Settings effects should call extracted loaders..."
if ! grep -q "void loadCommunityMemberSettings({" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing loadCommunityMemberSettings wiring"
  exit 1
fi
if ! grep -q "void loadCommunityPricing({" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing loadCommunityPricing wiring"
  exit 1
fi
if ! grep -q "void loadCommunityMemberSettings({" "$WEB_APP" \
  && ! grep -q "void params.loadCommunityMemberSettings({" "$WEB_SETTINGS_ACCESS_HOOK"; then
  echo "FAIL: web app missing loadCommunityMemberSettings wiring (app or settings/access hook)"
  exit 1
fi
if ! grep -q "void loadCommunityPricing({" "$WEB_APP" \
  && ! grep -q "void params.loadCommunityPricing({" "$WEB_SETTINGS_ACCESS_HOOK"; then
  echo "FAIL: web app missing loadCommunityPricing wiring (app or settings/access hook)"
  exit 1
fi

echo "[5/8] App shells should not reference removed funnel loader..."
if grep -q "loadCommunityFunnelConfig" "$DESKTOP_APP"; then
  echo "FAIL: desktop app should not reference loadCommunityFunnelConfig"
  exit 1
fi
if grep -q "loadCommunityFunnelConfig" "$WEB_APP"; then
  echo "FAIL: web app should not reference loadCommunityFunnelConfig"
  exit 1
fi

echo "[6/8] App shells should not keep inline settings-load helper logic..."
for pattern in \
  "type CommunityMemberSettings = {" \
  "const formatPlanAmount = (row: typeof monthly): string => {"; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still contains inline settings-load helper: $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains inline settings-load helper: $pattern"
    exit 1
  fi
done

echo "[7/8] Settings-load endpoint literals should not live in app shells..."
if grep -q "community_member_settings?select=community_id,user_id,muted,muted_until,created_at,updated_at" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still contains member settings load endpoint literal"
  exit 1
fi
if grep -q "community_member_settings?select=community_id,user_id,muted,muted_until,created_at,updated_at" "$WEB_APP"; then
  echo "FAIL: web app still contains member settings load endpoint literal"
  exit 1
fi
if grep -q "/rest/v1/rpc/get_community_funnel_config" "$DESKTOP_APP"; then
  echo "FAIL: desktop app should not contain funnel config load endpoint literal"
  exit 1
fi
if grep -q "/rest/v1/rpc/get_community_funnel_config" "$WEB_APP"; then
  echo "FAIL: web app should not contain funnel config load endpoint literal"
  exit 1
fi
if grep -q "/rest/v1/rpc/get_community_pricing" "$DESKTOP_APP"; then
  echo "FAIL: desktop app should not contain settings pricing endpoint literal"
  exit 1
fi
if grep -q "/rest/v1/rpc/get_community_pricing" "$WEB_APP"; then
  echo "FAIL: web app should not contain settings pricing endpoint literal"
  exit 1
fi

echo "[8/8] Shared controller should own active settings-load endpoints only..."
for pattern in \
  "community_member_settings?select=community_id,user_id,muted,muted_until,created_at,updated_at" \
  "/rest/v1/rpc/get_community_pricing"; do
  if ! grep -q "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared settings data controller missing endpoint literal: $pattern"
    exit 1
  fi
done
for pattern in "loadCommunityMemberSettings" "loadCommunityPricing"; do
  if ! grep -q "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared settings data controller missing loader: $pattern"
    exit 1
  fi
done
if grep -q "loadCommunityFunnelConfig" "$SHARED_HOOK"; then
  echo "FAIL: shared settings data controller should not expose loadCommunityFunnelConfig"
  exit 1
fi
if grep -q "/rest/v1/rpc/get_community_funnel_config" "$SHARED_HOOK"; then
  echo "FAIL: shared settings data controller should not contain get_community_funnel_config endpoint"
  exit 1
fi

echo "PASS: community settings data controller regression checks passed."
