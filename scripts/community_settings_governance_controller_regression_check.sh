#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunitySettingsGovernanceController.ts"

echo "== Community settings/governance controller regression checks =="

echo "[1/8] App shells should import shared settings/governance controller..."
if ! grep -q 'from "../shared/useCommunitySettingsGovernanceController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunitySettingsGovernanceController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunitySettingsGovernanceController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunitySettingsGovernanceController"
  exit 1
fi

echo "[2/8] Shared settings/governance controller should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunitySettingsGovernanceController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunitySettingsGovernanceController export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared settings/governance controller..."
if ! grep -q "useCommunitySettingsGovernanceController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunitySettingsGovernanceController"
  exit 1
fi
if ! grep -q "useCommunitySettingsGovernanceController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunitySettingsGovernanceController"
  exit 1
fi

echo "[4/8] App shells should not define local settings/governance handlers..."
for pattern in \
  "function handleToggleCommunityMute(" \
  "function handleLeaveCommunity(" \
  "function handleSaveCommunitySettings(" \
  "function handleSaveCommunityFunnelConfig("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/8] Settings/governance UI should remain wired to extracted handlers..."
for pattern in \
  "onChange={(event) => void handleToggleCommunityMute(event.target.checked)}" \
  "onClick={() => void handleLeaveCommunity()}" \
  "onClick={() => void handleSaveCommunitySettings()}"; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app missing binding: $pattern"
    exit 1
  fi
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app missing binding: $pattern"
    exit 1
  fi
done
if grep -q "onClick={() => void handleSaveCommunityFunnelConfig()}" "$WEB_APP"; then
  echo "FAIL: web app should not bind handleSaveCommunityFunnelConfig"
  exit 1
fi

echo "[6/8] Settings/governance endpoint literals should move out of app shells..."
for pattern in \
  "/rest/v1/rpc/save_community_settings" \
  "/rest/v1/rpc/leave_community" \
  "community_member_settings?on_conflict=community_id,user_id"; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still contains settings/governance endpoint literal: $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains settings/governance endpoint literal: $pattern"
    exit 1
  fi
  if ! grep -q "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared hook missing settings/governance endpoint literal: $pattern"
    exit 1
  fi
done

echo "[7/8] Removed funnel-save path should stay deleted..."
for path in "$DESKTOP_APP" "$WEB_APP" "$SHARED_HOOK"; do
  if grep -q "/rest/v1/rpc/save_community_funnel_config" "$path"; then
    echo "FAIL: removed save_community_funnel_config endpoint still present in $path"
    exit 1
  fi
  if grep -q "handleSaveCommunityFunnelConfig" "$path"; then
    echo "FAIL: removed handleSaveCommunityFunnelConfig symbol still present in $path"
    exit 1
  fi
done

echo "[8/8] Leave-community reset callback should remain explicit in app shells..."
if ! grep -q "onLeaveCommunityLocalState: (leavingId) => {" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing onLeaveCommunityLocalState wiring"
  exit 1
fi
if ! grep -q "onLeaveCommunityLocalState: (leavingId) => {" "$WEB_APP"; then
  echo "FAIL: web app missing onLeaveCommunityLocalState wiring"
  exit 1
fi

echo "PASS: community settings/governance controller regression checks passed."
