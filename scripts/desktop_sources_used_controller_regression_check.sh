#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
HOOK_FILE="src/controllers/desktop/useDesktopSourcesUsed.ts"

echo "== Desktop sources-used controller regression checks =="

echo "[1/6] Desktop app should import sources-used controller hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopSourcesUsed\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing useDesktopSourcesUsed"
  exit 1
fi

echo "[2/6] Desktop app should instantiate useDesktopSourcesUsed..."
if ! grep -q "const { handleOpenSourcesUsed } = useDesktopSourcesUsed({" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not creating handleOpenSourcesUsed through useDesktopSourcesUsed"
  exit 1
fi

echo "[3/6] Desktop app should not keep local handleOpenSourcesUsed implementation..."
if grep -q "async function handleOpenSourcesUsed(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines local handleOpenSourcesUsed"
  exit 1
fi

echo "[4/6] Hook should fetch memory retrieval events through runtime client..."
if ! grep -q "runtimeClient.getEvent" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSourcesUsed is not loading retrieval event payloads from runtime client"
  exit 1
fi

echo "[5/6] Hook should normalize evidence for rendering..."
if ! grep -q "extractCommunityEvidenceUsedV1" "$HOOK_FILE"; then
  echo "FAIL: useDesktopSourcesUsed is missing community evidence extraction"
  exit 1
fi

echo "[6/6] Thread/message surfaces should still trigger open-sources flow..."
if ! grep -q "void handleOpenSourcesUsed(turnForMessage);" "$DESKTOP_APP_FILE"; then
  echo "FAIL: sources used action is not wired to message/turn cards"
  exit 1
fi

echo "PASS: desktop sources-used controller regression checks passed."
