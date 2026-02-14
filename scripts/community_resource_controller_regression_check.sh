#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityResourceController.ts"

echo "== Community resource controller regression checks =="

echo "[1/8] App shells should import shared resource controller hook..."
if ! grep -q 'from "../shared/useCommunityResourceController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityResourceController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityResourceController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityResourceController"
  exit 1
fi

echo "[2/8] Shared hook file must exist and export useCommunityResourceController..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityResourceController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityResourceController export"
  exit 1
fi

echo "[3/8] App shells should instantiate the shared resource controller..."
if ! grep -q "useCommunityResourceController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityResourceController"
  exit 1
fi
if ! grep -q "useCommunityResourceController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityResourceController"
  exit 1
fi

echo "[4/8] App shells should not define local resource CRUD handlers..."
for pattern in \
  "function loadCommunityResources(" \
  "function handleSaveCommunityResource(" \
  "function handleDeleteResource("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/8] Desktop should preserve strict resource save wiring (secret scan + config + payload shape)..."
if ! grep -q "requireAnonKey: true" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing requireAnonKey: true in resource controller wiring"
  exit 1
fi
if ! grep -q 'missingConfigMessage: "Missing Supabase config."' "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing desktop resource config error message"
  exit 1
fi
if ! grep -q "beforeSaveValidate: async (" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing beforeSaveValidate in resource controller wiring"
  exit 1
fi
if ! grep -q "scanPublishContent(\\[title, description, rawUrl\\]" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing resource scanPublishContent call in controller wiring"
  exit 1
fi
if ! grep -q "includeCommunityIdOnPatch: true" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing includeCommunityIdOnPatch: true in resource controller wiring"
  exit 1
fi
if ! grep -q "includeFileKeyOnSave: true" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing includeFileKeyOnSave: true in resource controller wiring"
  exit 1
fi
if ! grep -q "clearErrorWhenEditingDeleted: false" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing clearErrorWhenEditingDeleted: false in resource controller wiring"
  exit 1
fi

echo "[6/8] Web should preserve URL-only resource wiring..."
if ! grep -q "requireAnonKey: false" "$WEB_APP"; then
  echo "FAIL: web app missing requireAnonKey: false in resource controller wiring"
  exit 1
fi
if ! grep -q 'missingConfigMessage: "Missing Supabase URL."' "$WEB_APP"; then
  echo "FAIL: web app missing web resource config error message"
  exit 1
fi
if ! grep -q "includeCommunityIdOnPatch: false" "$WEB_APP"; then
  echo "FAIL: web app missing includeCommunityIdOnPatch: false in resource controller wiring"
  exit 1
fi
if ! grep -q "includeFileKeyOnSave: false" "$WEB_APP"; then
  echo "FAIL: web app missing includeFileKeyOnSave: false in resource controller wiring"
  exit 1
fi
if ! grep -q "clearErrorWhenEditingDeleted: true" "$WEB_APP"; then
  echo "FAIL: web app missing clearErrorWhenEditingDeleted: true in resource controller wiring"
  exit 1
fi

echo "[7/8] Library UI should still bind resource save/delete actions..."
if ! grep -q "onClick={() => void handleSaveCommunityResource()}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding handleSaveCommunityResource in library UI"
  exit 1
fi
if ! grep -q "onClick={() => void handleDeleteResource(resource.id)}" "$DESKTOP_APP"; then
  echo "FAIL: desktop app not binding handleDeleteResource in library UI"
  exit 1
fi
if ! grep -q "onClick={() => void handleSaveCommunityResource()}" "$WEB_APP"; then
  echo "FAIL: web app not binding handleSaveCommunityResource in library UI"
  exit 1
fi
if ! grep -q "onClick={() => void handleDeleteResource(resource.id)}" "$WEB_APP"; then
  echo "FAIL: web app not binding handleDeleteResource in library UI"
  exit 1
fi

echo "[8/8] Community lifecycle should still trigger resource reloads..."
if ! grep -q "void loadCommunityResources(activeCommunityId, supabaseSession);" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing loadCommunityResources lifecycle call"
  exit 1
fi
if ! grep -q "void loadCommunityResources(activeCommunityId, supabaseSession);" "$WEB_APP"; then
  echo "FAIL: web app missing loadCommunityResources lifecycle call"
  exit 1
fi

echo "PASS: community resource controller regression checks passed."
