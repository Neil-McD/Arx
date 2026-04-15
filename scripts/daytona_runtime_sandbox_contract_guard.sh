#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Daytona runtime sandbox contract guard =="

FILE="$ROOT_DIR/convex/daytonaSandboxClient.ts"

if [[ ! -f "$FILE" ]]; then
  echo "FAIL: missing file: $FILE"
  exit 1
fi

BLOCK="$(awk '
  /export async function createDaytonaSandbox\(params:/ { capture=1 }
  /export async function listDaytonaSandboxes\(params:/ { capture=0 }
  capture { print }
' "$FILE")"

if [[ -z "$BLOCK" ]]; then
  echo "FAIL: could not locate createDaytonaSandbox block"
  exit 1
fi

require_in_block() {
  local pattern="$1"
  local description="$2"
  if ! grep -F "$pattern" <<<"$BLOCK" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

forbid_in_block() {
  local pattern="$1"
  local description="$2"
  if grep -F "$pattern" <<<"$BLOCK" >/dev/null; then
    echo "FAIL: forbidden sandbox contract pattern detected: $description"
    grep -n -F "$pattern" <<<"$BLOCK" || true
    exit 1
  fi
  echo "OK: $description"
}

require_in_block 'if (params.config.snapshot) payloadBase.snapshot = params.config.snapshot;' \
  "runtime sandbox create may include explicit snapshot"
require_in_block 'payloadBase.volumes = [' \
  "runtime sandbox create preserves workspace volume mount container"
require_in_block 'volumeId: params.projectVolumeId' \
  "runtime sandbox create preserves workspace volume id"
require_in_block 'mountPath: DAYTONA_WORKSPACE_ROOT' \
  "runtime sandbox create preserves workspace volume mount path"

forbid_in_block 'cpu:' \
  "runtime sandbox create must not send explicit cpu sizing"
forbid_in_block 'memory:' \
  "runtime sandbox create must not send explicit memory sizing"
forbid_in_block 'disk:' \
  "runtime sandbox create must not send explicit disk sizing"

echo "PASS: daytona runtime sandbox contract guard passed."
