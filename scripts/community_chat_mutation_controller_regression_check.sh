#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityChatMutationController.ts"

echo "== Community chat mutation controller regression checks =="

echo "[1/8] App shells should import shared community chat mutation controller hook..."
if ! grep -q 'from "../shared/useCommunityChatMutationController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityChatMutationController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityChatMutationController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityChatMutationController"
  exit 1
fi

echo "[2/8] Shared hook file must exist and export useCommunityChatMutationController..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityChatMutationController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityChatMutationController export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared mutation controller..."
if ! grep -q "useCommunityChatMutationController({" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityChatMutationController"
  exit 1
fi
if ! grep -q "useCommunityChatMutationController({" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityChatMutationController"
  exit 1
fi

echo "[4/8] App shells should not define local reaction/edit/reply/send handlers..."
for pattern in \
  "function handleToggleReaction(" \
  "function handleStartReply(" \
  "function handleStartEdit(" \
  "function handleCancelEdit(" \
  "function handleSaveEdit(" \
  "function handleDeleteMessage(" \
  "function handleSendCommunityMessage("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/8] Desktop shell should keep pre-send secret validation..."
if ! grep -q "beforeSendValidate: async (text) => {" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing beforeSendValidate in mutation controller wiring"
  exit 1
fi
if ! grep -q "scanPublishContent(text)" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing scanPublishContent call in mutation controller wiring"
  exit 1
fi

echo "[6/8] Desktop shell should continue requiring URL + anon key config..."
if ! grep -q "requireAnonKey: true" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing requireAnonKey: true in mutation controller wiring"
  exit 1
fi
if ! grep -q 'missingConfigMessage: "Missing Supabase config."' "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing desktop config error message in mutation controller wiring"
  exit 1
fi

echo "[7/8] Web shell should preserve URL-only config gating..."
if ! grep -q "requireAnonKey: false" "$WEB_APP"; then
  echo "FAIL: web app missing requireAnonKey: false in mutation controller wiring"
  exit 1
fi
if ! grep -q 'missingConfigMessage: "Missing Supabase URL."' "$WEB_APP"; then
  echo "FAIL: web app missing web config error message in mutation controller wiring"
  exit 1
fi

echo "[8/8] Chat rows should still receive mutation handlers..."
if ! grep -q "onToggleReaction={handleToggleReaction}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding handleToggleReaction in chat rows"
  exit 1
fi
if ! grep -q "onToggleReaction={handleToggleReaction}" "$WEB_APP"; then
  echo "FAIL: web app not binding handleToggleReaction in chat rows"
  exit 1
fi
if ! grep -q "onSaveEdit={handleSaveEdit}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding handleSaveEdit in chat rows"
  exit 1
fi
if ! grep -q "onSaveEdit={handleSaveEdit}" "$WEB_APP"; then
  echo "FAIL: web app not binding handleSaveEdit in chat rows"
  exit 1
fi

echo "PASS: community chat mutation controller regression checks passed."
