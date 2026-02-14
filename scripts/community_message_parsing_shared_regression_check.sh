#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
WEB_APP_FILE="apps/web/src/App.tsx"
SHARED_FILE="shared/communityMessageParsing.ts"

echo "== Community message parsing shared regression checks =="

echo "[1/7] Shared parser module should exist with expected exports..."
if ! test -f "$SHARED_FILE"; then
  echo "FAIL: missing shared/communityMessageParsing.ts"
  exit 1
fi
if ! grep -q "export function extractTextFromContentJson" "$SHARED_FILE"; then
  echo "FAIL: shared parser missing extractTextFromContentJson export"
  exit 1
fi
if ! grep -q "export function parseMessageAttachments" "$SHARED_FILE"; then
  echo "FAIL: shared parser missing parseMessageAttachments export"
  exit 1
fi
if ! grep -q "export function parseReplyPrefix" "$SHARED_FILE"; then
  echo "FAIL: shared parser missing parseReplyPrefix export"
  exit 1
fi
if ! grep -q "export function truncateReplyPreview" "$SHARED_FILE"; then
  echo "FAIL: shared parser missing truncateReplyPreview export"
  exit 1
fi

echo "[2/7] Desktop app should import shared parser..."
if ! grep -q "from \"../shared/communityMessageParsing\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing shared community message parser"
  exit 1
fi

echo "[3/7] Web app should import shared parser..."
if ! grep -q "from \"../../../shared/communityMessageParsing\"" "$WEB_APP_FILE"; then
  echo "FAIL: web app is not importing shared community message parser"
  exit 1
fi

echo "[4/7] Desktop app should not define local parser helpers..."
if grep -q "function extractTextFromContentJson(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines extractTextFromContentJson"
  exit 1
fi
if grep -q "function parseMessageAttachments(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines parseMessageAttachments"
  exit 1
fi

echo "[5/7] Web app should not define local parser helpers..."
if grep -q "function extractTextFromContentJson(" "$WEB_APP_FILE"; then
  echo "FAIL: web app still defines extractTextFromContentJson"
  exit 1
fi
if grep -q "function parseMessageAttachments(" "$WEB_APP_FILE"; then
  echo "FAIL: web app still defines parseMessageAttachments"
  exit 1
fi

echo "[6/7] Reply helpers should not be duplicated in desktop/web app files..."
if grep -q "function buildReplyPrefix(" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines buildReplyPrefix"
  exit 1
fi
if grep -q "function buildReplyPrefix(" "$WEB_APP_FILE"; then
  echo "FAIL: web app still defines buildReplyPrefix"
  exit 1
fi

echo "[7/7] Desktop and web should alias MessageAttachment to shared type..."
if ! grep -q "^type MessageAttachment = CommunityMessageAttachment;" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop MessageAttachment is not aliased to CommunityMessageAttachment"
  exit 1
fi
if ! grep -q "^type MessageAttachment = CommunityMessageAttachment;" "$WEB_APP_FILE"; then
  echo "FAIL: web MessageAttachment is not aliased to CommunityMessageAttachment"
  exit 1
fi

echo "PASS: community message parsing shared regression checks passed."
