#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunitySettingsFormController.ts"
WEB_SETTINGS_ACCESS_HOOK="apps/web/src/controllers/useWebCommunitySettingsAccessLifecycle.ts"

echo "== Community settings form controller regression checks =="

echo "[1/9] App shells should import shared settings form controller..."
if ! grep -q 'from "../shared/useCommunitySettingsFormController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunitySettingsFormController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunitySettingsFormController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunitySettingsFormController"
  exit 1
fi

echo "[2/9] Shared settings form controller should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunitySettingsFormController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunitySettingsFormController export"
  exit 1
fi

echo "[3/9] App shells should instantiate shared settings form controller..."
if ! grep -q "useCommunitySettingsFormController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunitySettingsFormController"
  exit 1
fi
if ! grep -q "useCommunitySettingsFormController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunitySettingsFormController"
  exit 1
fi

echo "[4/9] App shells should synchronize settings state via extracted controller..."
if ! grep -q "syncCommunitySettingsSelection({" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing syncCommunitySettingsSelection wiring"
  exit 1
fi
if ! grep -q "syncCommunitySettingsSelection({" "$WEB_APP" \
  && ! grep -q "syncCommunitySettingsSelection({" "$WEB_SETTINGS_ACCESS_HOOK"; then
  echo "FAIL: web app missing syncCommunitySettingsSelection wiring (app or settings/access hook)"
  exit 1
fi

echo "[5/9] App shells should not keep inline settings-form switch/init logic..."
for pattern in \
  "const switchingCommunity = communitySettingsLoadedCommunityIdRef.current !== nextLoadedId;" \
  "const current = communities.find((c) => c.id === activeCommunityId) ?? null;" \
  "setCommunitySettingsName(current.name ?? \"\");"; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still contains inline settings-form logic: $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains inline settings-form logic: $pattern"
    exit 1
  fi
done

echo "[6/9] Shared controller should own common settings-form reset/hydrate logic..."
for pattern in \
  "communitySettingsLoadedCommunityIdRef.current !== nextLoadedId" \
  "params.communities.find((community) => community.id === params.activeCommunityId)" \
  "setCommunitySettingsPricingMode(\"free\")" \
  "setCommunitySettingsName(selectedCommunity.name ?? \"\")" \
  "setCommunityInvites([])"; do
  if ! grep -Fq "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared settings form controller missing logic pattern: $pattern"
    exit 1
  fi
done

echo "[7/9] Desktop wiring should preserve missing-community banner reset behavior..."
if ! grep -q "clearBannerOnMissingCommunity: true" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing clearBannerOnMissingCommunity wiring"
  exit 1
fi

echo "[8/9] Web funnel reset hooks should be wired when funnel editor state exists..."
if grep -q "communityFunnelDirtyRef\|resetCommunityFunnelEditor" "$WEB_APP"; then
  for pattern in \
    "onCommunitySwitched: () => {" \
    "communityFunnelDirtyRef.current = false;" \
    "resetCommunityFunnelEditor();" \
    "onNoCommunitySelected: () => {"; do
    if ! grep -q "$pattern" "$WEB_APP"; then
      echo "FAIL: web app missing funnel reset wiring: $pattern"
      exit 1
    fi
  done
fi

echo "[9/9] Shared controller should expose syncCommunitySettingsSelection..."
if ! grep -q "syncCommunitySettingsSelection" "$SHARED_HOOK"; then
  echo "FAIL: shared settings form controller missing syncCommunitySettingsSelection"
  exit 1
fi

echo "PASS: community settings form controller regression checks passed."
