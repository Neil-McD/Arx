#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"

echo "== Desktop runtime type dedupe checks =="

echo "[1/6] Desktop app should import canonical ARP types with aliases..."
if ! grep -q "type ThreadRecord as ArpThreadRecord" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing canonical ArpThreadRecord"
  exit 1
fi
if ! grep -q "type MessageRecord as ArpMessageRecord" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop app is not importing canonical ArpMessageRecord"
  exit 1
fi

echo "[2/6] Desktop thread/message/event/session types should alias canonical ARP types..."
if ! grep -q "^type ThreadRecord = ArpThreadRecord;" "$DESKTOP_APP_FILE"; then
  echo "FAIL: ThreadRecord is not aliased to ArpThreadRecord"
  exit 1
fi
if ! grep -q "^type MessageRecord = ArpMessageRecord;" "$DESKTOP_APP_FILE"; then
  echo "FAIL: MessageRecord is not aliased to ArpMessageRecord"
  exit 1
fi
if ! grep -q "^type EventRecord = ArpEventRecord;" "$DESKTOP_APP_FILE"; then
  echo "FAIL: EventRecord is not aliased to ArpEventRecord"
  exit 1
fi
if ! grep -q "^type SessionResume = ArpSessionResume;" "$DESKTOP_APP_FILE"; then
  echo "FAIL: SessionResume is not aliased to ArpSessionResume"
  exit 1
fi

echo "[3/6] Desktop tool call type should extend canonical ArpToolCallRecord..."
if ! grep -q "^type ToolCallRecord = ArpToolCallRecord & {" "$DESKTOP_APP_FILE"; then
  echo "FAIL: ToolCallRecord is not extending ArpToolCallRecord"
  exit 1
fi

echo "[4/6] Legacy inline runtime object type declarations should be removed..."
if grep -q "^type ThreadRecord = {" "$DESKTOP_APP_FILE"; then
  echo "FAIL: legacy inline ThreadRecord object type still exists"
  exit 1
fi
if grep -q "^type MessageRecord = {" "$DESKTOP_APP_FILE"; then
  echo "FAIL: legacy inline MessageRecord object type still exists"
  exit 1
fi
if grep -q "^type EventRecord = {" "$DESKTOP_APP_FILE"; then
  echo "FAIL: legacy inline EventRecord object type still exists"
  exit 1
fi

echo "[5/6] Unused local SendTurnResult type should be removed..."
if grep -q "^type SendTurnResult = {" "$DESKTOP_APP_FILE"; then
  echo "FAIL: local SendTurnResult type still exists"
  exit 1
fi

echo "[6/6] Thread lane should derive from canonical thread type..."
if ! grep -q "^type ThreadLane = ArpThreadRecord\\[\"thread_lane\"\\];" "$DESKTOP_APP_FILE"; then
  echo "FAIL: ThreadLane is not derived from ArpThreadRecord"
  exit 1
fi

echo "PASS: desktop runtime type dedupe checks passed."
