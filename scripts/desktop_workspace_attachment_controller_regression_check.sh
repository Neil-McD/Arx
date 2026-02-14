#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
CONTROLLER_FILE="src/controllers/desktop/useDesktopWorkspaceAttachmentController.ts"

echo "== Desktop workspace attachment controller regression checks =="

echo "[1/6] Desktop app should import and instantiate workspace attachment controller hook..."
if ! grep -q 'from "./controllers/desktop/useDesktopWorkspaceAttachmentController"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useDesktopWorkspaceAttachmentController"
  exit 1
fi
if ! grep -q "useDesktopWorkspaceAttachmentController<Attachment>" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useDesktopWorkspaceAttachmentController"
  exit 1
fi

echo "[2/6] Desktop app should not keep inline workspace attachment handlers..."
if grep -q "async function handleAddAttachment" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleAddAttachment"
  exit 1
fi
if grep -q "function handleRemoveAttachment" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleRemoveAttachment"
  exit 1
fi
if grep -q "function handleDragOver" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleDragOver"
  exit 1
fi
if grep -q "function handleDrop" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleDrop"
  exit 1
fi

echo "[3/6] Desktop app should not directly wire Tauri drag-drop listener inline..."
if grep -q "onDragDropEvent" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still wires drag-drop listener directly"
  exit 1
fi

echo "[4/6] Controller file should exist and export useDesktopWorkspaceAttachmentController..."
if ! grep -q "export function useDesktopWorkspaceAttachmentController" "$CONTROLLER_FILE"; then
  echo "FAIL: controller export missing in $CONTROLLER_FILE"
  exit 1
fi

echo "[5/6] Controller should own attachment ingestion + drag-drop wiring..."
if ! grep -q "shellClient.ingestAttachment" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing shellClient.ingestAttachment usage"
  exit 1
fi
if ! grep -q "onDragDropEvent" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing Tauri drag-drop wiring"
  exit 1
fi
if ! grep -q "open({" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing attachment picker open() flow"
  exit 1
fi

echo "[6/6] Desktop app should still wire returned handlers to UI..."
if ! grep -q "onClick={handleAddAttachment}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not wiring handleAddAttachment to toolbar button"
  exit 1
fi
if ! grep -q "onClick={() => handleRemoveAttachment(att.id)}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not wiring handleRemoveAttachment in attachment preview"
  exit 1
fi
if ! grep -Fq 'ask-bar${isDraggingOver ? " drag-over" : ""}' "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not using isDraggingOver for ask-bar class"
  exit 1
fi

echo "PASS: desktop workspace attachment controller regression checks passed."
