#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityInviteController.ts"
SHARED_LINKS="shared/communityInviteLinks.ts"

echo "== Community invite controller regression checks =="

echo "[1/8] App shells should import shared invite controller hook..."
if ! grep -q 'from "../shared/useCommunityInviteController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityInviteController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityInviteController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityInviteController"
  exit 1
fi

echo "[2/8] Shared invite controller and link utility files must exist..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if [[ ! -f "$SHARED_LINKS" ]]; then
  echo "FAIL: $SHARED_LINKS is missing"
  exit 1
fi
if ! grep -q "export function useCommunityInviteController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityInviteController export"
  exit 1
fi
if ! grep -q "export function buildDesktopBestInviteLink" "$SHARED_LINKS"; then
  echo "FAIL: $SHARED_LINKS missing buildDesktopBestInviteLink export"
  exit 1
fi
if ! grep -q "export function buildCommunityInstantAccessLink" "$SHARED_LINKS"; then
  echo "FAIL: $SHARED_LINKS missing buildCommunityInstantAccessLink export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared invite controller..."
if ! grep -q "useCommunityInviteController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityInviteController"
  exit 1
fi
if ! grep -q "useCommunityInviteController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityInviteController"
  exit 1
fi

echo "[4/8] App shells should not define local invite mutation handlers..."
for pattern in \
  "function loadCommunityInvites(" \
  "function handleCreateInvite(" \
  "function handleRevokeInvite(" \
  "function handleDeleteInvite(" \
  "function generateInviteCode("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/8] Desktop should route invite code normalization + labels through shared links utility..."
if ! grep -q "normalizeInviteCode(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing normalizeInviteCode usage"
  exit 1
fi
if ! grep -q "formatInviteLabel(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing formatInviteLabel usage"
  exit 1
fi

echo "[6/8] Desktop should route invite link copy through shared desktop link builder..."
if ! grep -q "buildDesktopBestInviteLink({" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing buildDesktopBestInviteLink usage"
  exit 1
fi
if ! grep -q "shareBaseUrl: getPublicShareBaseUrl()" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing shareBaseUrl handoff for invite links"
  exit 1
fi

echo "[7/8] Web should route invite link copy through shared web link builder..."
if ! grep -q "buildCommunityInstantAccessLink(" "$WEB_APP"; then
  echo "FAIL: web app missing buildCommunityInstantAccessLink usage"
  exit 1
fi
if ! grep -q "window.location.origin" "$WEB_APP"; then
  echo "FAIL: web app missing origin handoff for invite links"
  exit 1
fi

echo "[8/8] Members invite section should still bind invite mutation handlers..."
if ! grep -q "onClick={() => void handleCreateInvite()}" "$DESKTOP_APP"; then
  echo "FAIL: desktop members invite section not binding handleCreateInvite"
  exit 1
fi
if ! grep -q "onClick={() => void handleRevokeInvite(invite.id)}" "$DESKTOP_APP"; then
  echo "FAIL: desktop members invite section not binding handleRevokeInvite"
  exit 1
fi
if ! grep -q "onClick={() => void handleDeleteInvite(invite.id)}" "$DESKTOP_APP"; then
  echo "FAIL: desktop members invite section not binding handleDeleteInvite"
  exit 1
fi
if ! grep -q "onClick={() => void handleCreateInvite()}" "$WEB_APP"; then
  echo "FAIL: web members invite section not binding handleCreateInvite"
  exit 1
fi
if ! grep -q "onClick={() => void handleRevokeInvite(invite.id)}" "$WEB_APP"; then
  echo "FAIL: web members invite section not binding handleRevokeInvite"
  exit 1
fi
if ! grep -q "onClick={() => void handleDeleteInvite(invite.id)}" "$WEB_APP"; then
  echo "FAIL: web members invite section not binding handleDeleteInvite"
  exit 1
fi

echo "PASS: community invite controller regression checks passed."
