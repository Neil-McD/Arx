#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityResourceEditorController.ts"

echo "== Community resource editor controller regression checks =="

echo "[1/7] App shells should import shared resource editor controller hook..."
if ! grep -q 'from "../shared/useCommunityResourceEditorController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityResourceEditorController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityResourceEditorController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityResourceEditorController"
  exit 1
fi

echo "[2/7] Shared hook file must exist and export useCommunityResourceEditorController..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityResourceEditorController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityResourceEditorController export"
  exit 1
fi

echo "[3/7] App shells should instantiate the shared resource editor controller..."
if ! grep -q "useCommunityResourceEditorController<CommunityResource>" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityResourceEditorController"
  exit 1
fi
if ! grep -q "useCommunityResourceEditorController<CommunityResource>" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityResourceEditorController"
  exit 1
fi

echo "[4/7] App shells should not define local resource editor helper functions..."
for pattern in \
  "function resetResourceForm(" \
  "function openNewResourceModal(" \
  "function closeResourceModal(" \
  "function handleEditResource("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/7] Library UI should still bind add/edit resource modal actions..."
if ! grep -q "onClick={openNewResourceModal}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding openNewResourceModal in library UI"
  exit 1
fi
if ! grep -q "onClick={() => handleEditResource(resource)}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding handleEditResource in library UI"
  exit 1
fi
if ! grep -q "onClick={openNewResourceModal}" "$WEB_APP"; then
  echo "FAIL: web app not binding openNewResourceModal in library UI"
  exit 1
fi
if ! grep -q "onClick={() => handleEditResource(resource)}" "$WEB_APP"; then
  echo "FAIL: web app not binding handleEditResource in library UI"
  exit 1
fi

echo "[6/7] Resource modal close actions should still use the shared close handler..."
if ! grep -q "onClick={closeResourceModal}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing closeResourceModal bindings"
  exit 1
fi
if ! grep -q "onClick={closeResourceModal}" "$WEB_APP"; then
  echo "FAIL: web app missing closeResourceModal bindings"
  exit 1
fi

echo "[7/7] Resource controller wiring should still include resetResourceForm output..."
if ! grep -q "resetResourceForm," "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing resetResourceForm from shared editor controller result"
  exit 1
fi
if ! grep -q "resetResourceForm," "$WEB_APP"; then
  echo "FAIL: web app missing resetResourceForm from shared editor controller result"
  exit 1
fi

echo "PASS: community resource editor controller regression checks passed."
