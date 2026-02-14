#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityChatDataController.ts"

echo "== Community chat data controller regression checks =="

echo "[1/8] App shells should import shared community chat data controller hook..."
if ! grep -q 'from "../shared/useCommunityChatDataController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityChatDataController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityChatDataController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityChatDataController"
  exit 1
fi

echo "[2/8] Shared hook file must exist and export useCommunityChatDataController..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityChatDataController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityChatDataController export"
  exit 1
fi

echo "[3/8] App shells should not define local chat row mapping functions..."
if grep -q "function toCommunityChatMessage(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local toCommunityChatMessage"
  exit 1
fi
if grep -q "function toCommunityChatMessage(" "$WEB_APP"; then
  echo "FAIL: web app still defines local toCommunityChatMessage"
  exit 1
fi

echo "[4/8] App shells should not define local ensureCommunityChatThread..."
if grep -q "function ensureCommunityChatThread(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local ensureCommunityChatThread"
  exit 1
fi
if grep -q "function ensureCommunityChatThread(" "$WEB_APP"; then
  echo "FAIL: web app still defines local ensureCommunityChatThread"
  exit 1
fi

echo "[5/8] App shells should not define local chat page loaders..."
if grep -q "function loadCommunityChat(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local loadCommunityChat"
  exit 1
fi
if grep -q "function loadCommunityChat(" "$WEB_APP"; then
  echo "FAIL: web app still defines local loadCommunityChat"
  exit 1
fi
if grep -q "function loadOlderCommunityChat(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local loadOlderCommunityChat"
  exit 1
fi
if grep -q "function loadOlderCommunityChat(" "$WEB_APP"; then
  echo "FAIL: web app still defines local loadOlderCommunityChat"
  exit 1
fi

echo "[6/8] App shells should not define local loadMessageReactions..."
if grep -q "function loadMessageReactions(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local loadMessageReactions"
  exit 1
fi
if grep -q "function loadMessageReactions(" "$WEB_APP"; then
  echo "FAIL: web app still defines local loadMessageReactions"
  exit 1
fi

echo "[7/8] Data controller should wire reset + realtime bridge outputs in app shells..."
if ! grep -q "resetCommunityChatDataState" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not wiring resetCommunityChatDataState"
  exit 1
fi
if ! grep -q "resetCommunityChatDataState" "$WEB_APP"; then
  echo "FAIL: web app is not wiring resetCommunityChatDataState"
  exit 1
fi
if ! grep -q "ensureCommunityChatThread" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not wiring ensureCommunityChatThread from controller"
  exit 1
fi
if ! grep -q "ensureCommunityChatThread" "$WEB_APP"; then
  echo "FAIL: web app is not wiring ensureCommunityChatThread from controller"
  exit 1
fi

echo "[8/8] Legacy CloudMessageRow aliases should be removed from app shells..."
if grep -q "type CloudMessageRow" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines legacy CloudMessageRow"
  exit 1
fi
if grep -q "type CloudMessageRow" "$WEB_APP"; then
  echo "FAIL: web app still defines legacy CloudMessageRow"
  exit 1
fi

echo "PASS: community chat data controller regression checks passed."
