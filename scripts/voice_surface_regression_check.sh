#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_BUTTON="shared/VoiceInputButton.tsx"
WEB_VOICE_CONTROLLER="shared/useWebVoiceInputController.ts"
DESKTOP_VOICE_CONTROLLER="src/controllers/desktop/useDesktopVoiceInputController.ts"
VOICE_EDGE_FN="supabase/functions/voice_transcribe/index.ts"

echo "== Voice surface regression checks =="

echo "[1/8] Shared voice button component should exist..."
if [[ ! -f "$SHARED_BUTTON" ]]; then
  echo "FAIL: missing shared voice button component: $SHARED_BUTTON"
  exit 1
fi
if ! grep -q "export function VoiceInputButton" "$SHARED_BUTTON"; then
  echo "FAIL: shared voice button export missing in $SHARED_BUTTON"
  exit 1
fi

echo "[2/8] Desktop + web app shells should import shared voice button..."
if ! grep -q 'from "../shared/VoiceInputButton"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing VoiceInputButton import"
  exit 1
fi
if ! grep -q 'from "../../../shared/VoiceInputButton"' "$WEB_APP"; then
  echo "FAIL: web app missing VoiceInputButton import"
  exit 1
fi

echo "[3/8] Desktop + web app shells should use voice controllers..."
if ! grep -q "useDesktopVoiceInputController" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing useDesktopVoiceInputController usage"
  exit 1
fi
if ! grep -q "useWebVoiceInputController" "$WEB_APP"; then
  echo "FAIL: web app missing useWebVoiceInputController usage"
  exit 1
fi

echo "[4/8] Voice controller modules should exist..."
if [[ ! -f "$WEB_VOICE_CONTROLLER" ]]; then
  echo "FAIL: missing web voice controller: $WEB_VOICE_CONTROLLER"
  exit 1
fi
if [[ ! -f "$DESKTOP_VOICE_CONTROLLER" ]]; then
  echo "FAIL: missing desktop voice controller: $DESKTOP_VOICE_CONTROLLER"
  exit 1
fi

echo "[5/8] Voice buttons should stay wired for workspace + community surfaces..."
for pattern in \
  'onClick={() => void handleVoiceInputClick("workspace")}' \
  'onClick={() => void handleVoiceInputClick("community")}'; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app missing voice click binding: $pattern"
    exit 1
  fi
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app missing voice click binding: $pattern"
    exit 1
  fi
done

echo "[6/8] App shells should no longer duplicate inline voice icon rendering..."
if grep -q "function renderVoiceButtonVisual" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines renderVoiceButtonVisual"
  exit 1
fi
if grep -q "function renderVoiceButtonVisual" "$WEB_APP"; then
  echo "FAIL: web app still defines renderVoiceButtonVisual"
  exit 1
fi

echo "[7/8] Voice button should render native mic states..."
for pattern in \
  "ask-mic-ripple" \
  "ask-mic-loader" \
  "ask-mic-icon"; do
  if ! grep -q "$pattern" "$SHARED_BUTTON"; then
    echo "FAIL: shared voice button missing state visual: $pattern"
    exit 1
  fi
done

echo "[8/8] Voice transcription edge function should remain present..."
if [[ ! -f "$VOICE_EDGE_FN" ]]; then
  echo "FAIL: missing voice transcription edge function: $VOICE_EDGE_FN"
  exit 1
fi

echo "PASS: voice surface regression checks passed."
