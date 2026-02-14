#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
SHELL_CLIENT_FILE="src/runtime/shell/client.ts"
TAURI_SHELL_CLIENT_FILE="src/runtime/shell/tauriClient.ts"

echo "== Desktop Supabase session secure-store guard =="

echo "[1/5] Desktop app should not persist auth session via localStorage..."
if grep -q "localStorage\\..*\"arx_supabase_session\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still references arx_supabase_session in localStorage"
  exit 1
fi

echo "[2/5] Desktop load path should read from shell secure store..."
if ! grep -q "stored = await shellClient\\.getSupabaseSession()" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop load path is not reading secure-store session through shell client"
  exit 1
fi

echo "[3/5] Desktop persist path should use shell secure store..."
if ! grep -q "await shellClient\\.setSupabaseSession(JSON\\.stringify(session))" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop persist path is not using shellClient.setSupabaseSession"
  exit 1
fi

echo "[4/5] Shell client contract should expose secure-store session APIs..."
if ! grep -q "getSupabaseSession(): Promise<string | null>;" "$SHELL_CLIENT_FILE"; then
  echo "FAIL: desktop shell client contract missing getSupabaseSession"
  exit 1
fi
if ! grep -q "setSupabaseSession(session_json: string): Promise<void>;" "$SHELL_CLIENT_FILE"; then
  echo "FAIL: desktop shell client contract missing setSupabaseSession"
  exit 1
fi
if ! grep -q "clearSupabaseSession(): Promise<void>;" "$SHELL_CLIENT_FILE"; then
  echo "FAIL: desktop shell client contract missing clearSupabaseSession"
  exit 1
fi

echo "[5/5] Tauri shell client should route secure-store session APIs..."
if ! grep -q "get_supabase_session_cmd" "$TAURI_SHELL_CLIENT_FILE"; then
  echo "FAIL: Tauri shell client missing get_supabase_session_cmd wiring"
  exit 1
fi
if ! grep -q "set_supabase_session_cmd" "$TAURI_SHELL_CLIENT_FILE"; then
  echo "FAIL: Tauri shell client missing set_supabase_session_cmd wiring"
  exit 1
fi
if ! grep -q "clear_supabase_session_cmd" "$TAURI_SHELL_CLIENT_FILE"; then
  echo "FAIL: Tauri shell client missing clear_supabase_session_cmd wiring"
  exit 1
fi

echo "PASS: desktop Supabase session secure-store guard passed."
