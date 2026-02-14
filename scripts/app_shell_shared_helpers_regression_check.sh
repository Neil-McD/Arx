#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
SHARED_APP_IDENTITY_FILE="shared/appIdentity.ts"
SHARED_ATTACHMENT_HELPERS_FILE="shared/attachmentHelpers.ts"
SHARED_PROVIDER_LOGOS_FILE="shared/providerLogos.ts"

echo "== App shell shared helpers regression checks =="

echo "[1/10] Desktop app should import shared app identity helpers..."
if ! grep -q 'from "../shared/appIdentity"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing shared/appIdentity.ts"
  exit 1
fi

echo "[2/10] Web app should import shared app identity helpers..."
if ! grep -q 'from "../../../shared/appIdentity"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing shared/appIdentity.ts"
  exit 1
fi

echo "[3/10] Desktop app should import shared attachment helpers..."
if ! grep -q 'from "../shared/attachmentHelpers"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing shared/attachmentHelpers.ts"
  exit 1
fi

echo "[4/10] Web app should import shared attachment helpers..."
if ! grep -q 'from "../../../shared/attachmentHelpers"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing shared/attachmentHelpers.ts"
  exit 1
fi

echo "[5/10] App shells should import shared provider logos..."
if ! grep -q 'from "../shared/providerLogos"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing shared/providerLogos.ts"
  exit 1
fi
if ! grep -q 'from "../../../shared/providerLogos"' "$WEB_APP_FILE"; then
  echo "FAIL: web App.tsx is not importing shared/providerLogos.ts"
  exit 1
fi

echo "[6/10] App shells should not redefine extracted helpers inline..."
for fn in \
  isUuid \
  getArxOwnerEmailSet \
  getArxOwnerUserIdSet \
  fileToDataUrl \
  isLikelyTextFile \
  isLikelyImageFile \
  isSupportedChatRasterImage \
  readTextAttachmentPreview \
  readChatImageAsDataUrl
do
  if rg -q "^[[:space:]]*(async[[:space:]]+)?function[[:space:]]+${fn}\\b|^[[:space:]]*const[[:space:]]+${fn}[[:space:]]*=" "$DESKTOP_APP_FILE" "$WEB_APP_FILE"; then
    echo "FAIL: extracted helper '${fn}' was reintroduced in App.tsx"
    exit 1
  fi
done

echo "[7/10] Shared helper modules should exist..."
for file in "$SHARED_APP_IDENTITY_FILE" "$SHARED_ATTACHMENT_HELPERS_FILE" "$SHARED_PROVIDER_LOGOS_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing shared helper module: $file"
    exit 1
  fi
done

echo "[8/10] Legacy per-shell provider logo folders should stay deleted..."
for dir in src/assets/provider-logos apps/web/src/assets/provider-logos; do
  if [[ -d "$dir" ]]; then
    echo "FAIL: legacy logo folder reintroduced: $dir"
    exit 1
  fi
done

echo "[9/10] App shells should not import provider logos directly..."
if rg -q "assets/provider-logos" "$DESKTOP_APP_FILE" "$WEB_APP_FILE"; then
  echo "FAIL: App.tsx imports provider logos directly; use shared/providerLogos.ts"
  exit 1
fi

echo "[10/10] Shared provider logo assets should exist in one canonical folder..."
for file in \
  shared/assets/provider-logos/openai.png \
  shared/assets/provider-logos/anthropic.png \
  shared/assets/provider-logos/google.png \
  shared/assets/provider-logos/xai.png \
  shared/assets/provider-logos/openrouter.webp
do
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing shared provider logo asset: $file"
    exit 1
  fi
done

echo "PASS: app shell shared helpers regression checks passed."
