#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
CONTROLLER_FILE="shared/threadPanelController.ts"
PANEL_ACTIONS_HOOK_FILE="src/controllers/desktop/useDesktopThreadPanelActions.ts"

echo "== Thread panel controller regression checks =="

echo "[1/7] Desktop should import thread panel actions hook..."
if ! grep -q "from \"./controllers/desktop/useDesktopThreadPanelActions\"" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing useDesktopThreadPanelActions"
  exit 1
fi

echo "[2/7] Shared controller file must export createThreadPanelController..."
if ! grep -q "export function createThreadPanelController" "$CONTROLLER_FILE"; then
  echo "FAIL: shared threadPanelController missing createThreadPanelController export"
  exit 1
fi

echo "[3/7] Hook should consume shared threadPanelController..."
if ! grep -q "from \"../../../shared/threadPanelController\"" "$PANEL_ACTIONS_HOOK_FILE"; then
  echo "FAIL: useDesktopThreadPanelActions is not importing shared threadPanelController"
  exit 1
fi
if ! grep -q "createThreadPanelController<TProject>" "$PANEL_ACTIONS_HOOK_FILE"; then
  echo "FAIL: useDesktopThreadPanelActions is not creating threadPanelController"
  exit 1
fi

echo "[4/7] Desktop should instantiate and use threadPanelController via hook..."
if ! grep -q "const threadPanelController = useDesktopThreadPanelActions<ProjectRecord>" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not creating a typed threadPanelController via hook"
  exit 1
fi
if ! grep -q "threadPanelController.setChatLane" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop lane switch is not wired through threadPanelController"
  exit 1
fi
if ! grep -q "threadPanelController.startDraftInProject" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop project draft action is not wired through threadPanelController"
  exit 1
fi

echo "[5/7] Desktop should not keep duplicate local transition handlers..."
if grep -q "const toggleProjectExpanded =" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines local toggleProjectExpanded handler"
  exit 1
fi
if grep -q "const startDraftInProject =" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app still defines local startDraftInProject handler"
  exit 1
fi

echo "[6/7] Project menu toggle should route through shared controller..."
if ! grep -q "onToggleProjectMenu={threadPanelController.toggleProjectMenu}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop project menu toggle is not wired through threadPanelController props"
  exit 1
fi

echo "[7/7] Hook should own panel menu close-on-outside behavior..."
if ! grep -q "document.addEventListener(\"mousedown\", handlePointerDown)" "$PANEL_ACTIONS_HOOK_FILE"; then
  echo "FAIL: useDesktopThreadPanelActions is missing outside-click close behavior"
  exit 1
fi

echo "PASS: thread panel controller regression checks passed."
