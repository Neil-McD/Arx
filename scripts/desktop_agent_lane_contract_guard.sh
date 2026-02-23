#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_RS="src-tauri/src/main.rs"
INVOKE_RS="src-tauri/src/invoke_registry.rs"
AUTH_INVITE_RS="src-tauri/src/commands/auth_invite.rs"
SHELL_CLIENT_TS="src/runtime/shell/client.ts"
SHELL_TAURI_TS="src/runtime/shell/tauriClient.ts"
DESKTOP_APP_TSX="src/App.tsx"
MATRIX_DOC="docs/auth-money-access-matrix.md"

echo "== Desktop agent lane contract guard =="

echo "[1/11] Desktop lane enum must include ChatGPT + Platform + Public..."
grep -q 'enum DesktopInferenceLane' "$MAIN_RS" || {
  echo "FAIL: DesktopInferenceLane enum is missing"
  exit 1
}
grep -q 'Chatgpt,' "$MAIN_RS" || {
  echo "FAIL: DesktopInferenceLane missing Chatgpt variant"
  exit 1
}
grep -q 'Platform,' "$MAIN_RS" || {
  echo "FAIL: DesktopInferenceLane missing Platform variant"
  exit 1
}
grep -q 'Public,' "$MAIN_RS" || {
  echo "FAIL: DesktopInferenceLane missing Public variant"
  exit 1
}

echo "[2/11] First lane chooser must be ChatGPT-first for eligible OpenAI models..."
FIRST_FN="$(sed -n '/fn first_desktop_inference_lane(/,/^}/p' "$MAIN_RS")"
if [[ -z "$FIRST_FN" ]]; then
  echo "FAIL: first_desktop_inference_lane function missing"
  exit 1
fi
if ! printf '%s\n' "$FIRST_FN" | rg -q 'openai_model'; then
  echo "FAIL: first_desktop_inference_lane missing openai_model input"
  exit 1
fi
if ! printf '%s\n' "$FIRST_FN" | rg -q 'has_chatgpt_auth'; then
  echo "FAIL: first_desktop_inference_lane missing has_chatgpt_auth input"
  exit 1
fi
if ! printf '%s\n' "$FIRST_FN" | rg -q 'DesktopInferenceLane::Chatgpt'; then
  echo "FAIL: first_desktop_inference_lane missing ChatGPT-first branch"
  exit 1
fi

echo "[3/11] Next-lane chooser must support ChatGPT -> Platform -> Public progression..."
grep -q 'fn next_desktop_inference_lane(' "$MAIN_RS" || {
  echo "FAIL: next_desktop_inference_lane function missing"
  exit 1
}
grep -q 'DesktopInferenceLane::Chatgpt' "$MAIN_RS" || {
  echo "FAIL: next_desktop_inference_lane missing ChatGPT branch"
  exit 1
}
grep -q 'DesktopInferenceLane::Platform' "$MAIN_RS" || {
  echo "FAIL: next_desktop_inference_lane missing Platform branch"
  exit 1
}
grep -q 'DesktopInferenceLane::Public' "$MAIN_RS" || {
  echo "FAIL: next_desktop_inference_lane missing Public branch"
  exit 1
}

echo "[4/11] Agent send loop must include ChatGPT request path and fallback reasons..."
grep -q 'openai.responses.json' "$MAIN_RS" || {
  echo "FAIL: missing ChatGPT request format marker"
  exit 1
}
grep -q 'ChatGPT-Account-Id' "$MAIN_RS" || {
  echo "FAIL: missing ChatGPT account header support"
  exit 1
}
grep -q 'chatgpt_http_' "$MAIN_RS" || {
  echo "FAIL: missing ChatGPT fallback reason codes"
  exit 1
}
grep -q 'get_chatgpt_auth_for_inference_with_timeout' "$MAIN_RS" || {
  echo "FAIL: missing ChatGPT auth refresh/retry path"
  exit 1
}

echo "[5/11] Agent runtime must keep platform/public lane endpoints..."
grep -q 'functions/v1/platform_agent_infer' "$MAIN_RS" || {
  echo "FAIL: platform_agent_infer endpoint missing from desktop runtime"
  exit 1
}
grep -q 'functions/v1/public_turn' "$MAIN_RS" || {
  echo "FAIL: public_turn endpoint missing from desktop runtime"
  exit 1
}

echo "[6/11] User-facing lane copy must include ChatGPT fallback guidance..."
grep -q 'Connect ChatGPT' "$MAIN_RS" || {
  echo "FAIL: missing Connect ChatGPT lane guidance copy"
  exit 1
}
grep -q 'Reconnect ChatGPT' "$MAIN_RS" || {
  echo "FAIL: missing Reconnect ChatGPT lane guidance copy"
  exit 1
}
grep -q 'ChatGPT sign-in failed' "$MAIN_RS" || {
  echo "FAIL: missing ChatGPT sign-in failure copy"
  exit 1
}

echo "[7/11] Canonical lane doc must include runtime_turn + desktop ChatGPT lane contract..."
grep -q 'Runtime lane: `public` | `daytona` | `platform_fallback` | `chatgpt_desktop`' "$MATRIX_DOC" || {
  echo "FAIL: matrix runtime lane contract is out of sync"
  exit 1
}
grep -q 'Desktop | Chat | authenticated | free/builder/pro | OpenAI alias + ChatGPT auth | false | optional `chatgpt_desktop` override' "$MATRIX_DOC" || {
  echo "FAIL: matrix desktop ChatGPT lane contract is out of sync"
  exit 1
}

echo "[8/11] Invoke registry must expose ChatGPT auth + cloud-turn commands..."
for cmd in \
  get_chatgpt_auth_summary_cmd \
  clear_chatgpt_auth_cmd \
  chatgpt_login_cmd \
  chatgpt_cloud_turn_cmd
do
  grep -q "$cmd" "$INVOKE_RS" || {
    echo "FAIL: invoke registry missing $cmd"
    exit 1
  }
done

echo "[9/11] Desktop shell adapters must expose ChatGPT auth + cloud-turn methods..."
for symbol in \
  getChatgptAuthSummary \
  chatgptLogin \
  clearChatgptAuth \
  chatgptCloudTurn
do
  rg -q "$symbol" "$SHELL_CLIENT_TS" "$SHELL_TAURI_TS" || {
    echo "FAIL: desktop shell client missing $symbol"
    exit 1
  }
done

echo "[10/11] Auth command module must expose ChatGPT handlers..."
for symbol in \
  get_chatgpt_auth_summary_cmd \
  clear_chatgpt_auth_cmd \
  chatgpt_login_cmd \
  chatgpt_cloud_turn_cmd
do
  rg -q "$symbol" "$AUTH_INVITE_RS" || {
    echo "FAIL: auth_invite missing $symbol"
    exit 1
  }
done

echo "[11/11] Desktop app must still expose ChatGPT settings/auth UX..."
rg -q 'chatgptAuthSummary|handleChatgpt|Sign in with ChatGPT' "$DESKTOP_APP_TSX" || {
  echo "FAIL: desktop app missing ChatGPT auth/settings surface"
  exit 1
}

echo "PASS: desktop agent lane contract guard passed."
