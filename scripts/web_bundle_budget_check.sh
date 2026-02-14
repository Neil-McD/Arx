#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${1:-apps/web}"
MAX_JS_BYTES="${MAX_WEB_JS_BUNDLE_BYTES:-500000}"
MAX_CSS_BYTES="${MAX_WEB_CSS_BUNDLE_BYTES:-220000}"

echo "== Web bundle budget checks =="
echo "Target app: ${APP_DIR}"
echo "Budgets: js<=${MAX_JS_BYTES} css<=${MAX_CSS_BYTES}"

if [[ ! -f "${ROOT_DIR}/${APP_DIR}/package.json" ]]; then
  echo "FAIL: app directory not found: ${ROOT_DIR}/${APP_DIR}"
  exit 1
fi

if [[ "${WEB_BUNDLE_BUDGET_SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building ${APP_DIR}..."
  (cd "${ROOT_DIR}/${APP_DIR}" && npm run -s build >/dev/null)
fi

ASSET_DIR="${ROOT_DIR}/${APP_DIR}/dist/assets"
if [[ ! -d "$ASSET_DIR" ]]; then
  echo "FAIL: missing build assets directory: $ASSET_DIR"
  exit 1
fi

shopt -s nullglob
js_files=("$ASSET_DIR"/*.js)
css_files=("$ASSET_DIR"/*.css)
shopt -u nullglob

if (( ${#js_files[@]} == 0 )); then
  echo "FAIL: no JS bundles found under $ASSET_DIR"
  exit 1
fi

check_asset_group() {
  local max_bytes="$1"
  local label="$2"
  shift 2
  local -a files=("$@")
  local failed=0

  if (( ${#files[@]} == 0 )); then
    echo "WARN: no ${label} assets found."
    return 0
  fi

  for file_path in "${files[@]}"; do
    local size_bytes
    size_bytes="$(wc -c < "$file_path" | tr -d ' ')"
    local filename
    filename="$(basename "$file_path")"
    echo "Checking ${label} asset ${filename}: size=${size_bytes} max=${max_bytes}"
    if (( size_bytes > max_bytes )); then
      echo "FAIL: ${filename} exceeds ${label} budget (${size_bytes} > ${max_bytes})"
      failed=1
    fi
  done

  if (( failed != 0 )); then
    return 1
  fi
  return 0
}

check_asset_group "$MAX_JS_BYTES" "js" "${js_files[@]}"
check_asset_group "$MAX_CSS_BYTES" "css" "${css_files[@]}"

echo "PASS: web bundle budget checks passed."
