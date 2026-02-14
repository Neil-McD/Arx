#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MAIN_FILE="src-tauri/src/main.rs"
MODULE_FILE="src-tauri/src/commands/attachment.rs"
COMMANDS_MOD_FILE="src-tauri/src/commands/mod.rs"
INVOKE_FILE="src-tauri/src/invoke_registry.rs"

echo "== main.rs attachment cluster boundary checks =="

echo "[1/6] commands module should expose attachment..."
if ! grep -q "pub(crate) mod attachment;" "$COMMANDS_MOD_FILE"; then
  echo "FAIL: commands/mod.rs missing attachment module export"
  exit 1
fi

echo "[2/6] main.rs should not define extracted attachment handler/types..."
if grep -q "fn ingest_attachment_cmd" "$MAIN_FILE"; then
  echo "FAIL: main.rs still defines ingest_attachment_cmd"
  exit 1
fi
if grep -q "struct AttachmentResult" "$MAIN_FILE"; then
  echo "FAIL: main.rs still defines AttachmentResult"
  exit 1
fi

echo "[3/6] module file should define attachment handler/types..."
if [[ ! -f "$MODULE_FILE" ]]; then
  echo "FAIL: attachment command module missing: $MODULE_FILE"
  exit 1
fi
if ! grep -q "struct AttachmentResult" "$MODULE_FILE"; then
  echo "FAIL: attachment module missing AttachmentResult"
  exit 1
fi
if ! grep -q "fn ingest_attachment_cmd" "$MODULE_FILE"; then
  echo "FAIL: attachment module missing ingest_attachment_cmd"
  exit 1
fi

echo "[4/6] invoke registry should route attachment handler through module..."
if ! grep -q "crate::commands::attachment::ingest_attachment_cmd" "$INVOKE_FILE"; then
  echo "FAIL: invoke registry missing routed attachment command path"
  exit 1
fi

echo "[5/6] invoke registry should not route attachment handler through main.rs..."
if grep -q "crate::ingest_attachment_cmd" "$INVOKE_FILE"; then
  echo "FAIL: invoke registry still routes attachment command through main.rs"
  exit 1
fi

echo "[6/6] attachment module should preserve preview + id behavior..."
for marker in \
  "STANDARD.encode" \
  "uuid::Uuid::new_v4" \
  "preview_data_url"
do
  if ! grep -q "$marker" "$MODULE_FILE"; then
    echo "FAIL: attachment module missing behavior marker: $marker"
    exit 1
  fi
done

echo "PASS: main.rs attachment cluster boundary checks passed."
