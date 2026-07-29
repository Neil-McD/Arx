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

GUARD_RG_OUTPUT=""
GUARD_RG_STATUS=0

_guard_rg_run() {
  local had_errexit=0
  case "$-" in
    *e*) had_errexit=1 ;;
  esac

  set +e
  GUARD_RG_OUTPUT="$(rg "$@" 2>&1)"
  GUARD_RG_STATUS=$?
  if [[ "$had_errexit" -eq 1 ]]; then
    set -e
  fi
}

guard_rg_assert_absent() {
  local description="$1"
  shift
  _guard_rg_run "$@"
  case "$GUARD_RG_STATUS" in
    0)
      if [[ -n "$GUARD_RG_OUTPUT" ]]; then
        printf '%s\n' "$GUARD_RG_OUTPUT" >&2
      fi
      echo "FAIL: forbidden match detected: $description" >&2
      return 1
      ;;
    1)
      return 0
      ;;
    *)
      if [[ -n "$GUARD_RG_OUTPUT" ]]; then
        printf '%s\n' "$GUARD_RG_OUTPUT" >&2
      fi
      echo "FAIL: search failed while checking: $description" >&2
      return "$GUARD_RG_STATUS"
      ;;
  esac
}

guard_rg_capture() {
  local description="$1"
  shift
  _guard_rg_run "$@"
  case "$GUARD_RG_STATUS" in
    0)
      if [[ -n "$GUARD_RG_OUTPUT" ]]; then
        printf '%s\n' "$GUARD_RG_OUTPUT"
      fi
      return 0
      ;;
    1)
      return 0
      ;;
    *)
      if [[ -n "$GUARD_RG_OUTPUT" ]]; then
        printf '%s\n' "$GUARD_RG_OUTPUT" >&2
      fi
      echo "FAIL: search failed while collecting: $description" >&2
      return "$GUARD_RG_STATUS"
      ;;
  esac
}
