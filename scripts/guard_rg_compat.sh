#!/usr/bin/env bash

if [[ -z "${ROOT_DIR:-}" && -n "${ROOT:-}" ]]; then
  ROOT_DIR="$ROOT"
fi
if [[ -z "${ROOT_DIR:-}" ]]; then
  ROOT_DIR="$(pwd)"
fi

if ! command -v rg >/dev/null 2>&1; then
  rg() {
    node "$ROOT_DIR/scripts/rg_compat.mjs" "$@"
  }
fi
