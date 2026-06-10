#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$CODEX_HOME"
chmod 700 "$CODEX_HOME" || true

cat > "$CODEX_HOME/config.toml" <<EOF
model = "${POLYNET_CODEX_WORKER_MODEL:-gpt-5.5}"
approval_policy = "never"
project_doc_max_bytes = 0
EOF
chmod 600 "$CODEX_HOME/config.toml" || true

if [[ -n "${CODEX_AUTH_JSON_BASE64:-}" ]]; then
  printf '%s' "$CODEX_AUTH_JSON_BASE64" | base64 -d > "$CODEX_HOME/auth.json"
  chmod 600 "$CODEX_HOME/auth.json" || true
elif [[ -n "${CODEX_ACCESS_TOKEN:-}" ]]; then
  printenv CODEX_ACCESS_TOKEN | codex login --with-access-token >/dev/null
elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
  printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null
elif [[ ! -f "$CODEX_HOME/auth.json" ]]; then
  echo "FAIL: provide CODEX_ACCESS_TOKEN, OPENAI_API_KEY, CODEX_AUTH_JSON_BASE64, or a mounted CODEX_HOME/auth.json" >&2
  exit 1
fi

unset CODEX_AUTH_JSON_BASE64
unset CODEX_ACCESS_TOKEN
unset OPENAI_API_KEY

if [[ -z "${POLYNET_CODEX_WORKER_AUTH_TOKEN:-}" ]]; then
  echo "FAIL: POLYNET_CODEX_WORKER_AUTH_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${BL_WORKSPACE:-}" || -z "${BL_API_KEY:-}" ]]; then
  echo "FAIL: BL_WORKSPACE and BL_API_KEY are required" >&2
  exit 1
fi

exec node \
  --experimental-strip-types \
  --experimental-specifier-resolution=node \
  /app/services/polynet-codex-worker/src/server.ts
