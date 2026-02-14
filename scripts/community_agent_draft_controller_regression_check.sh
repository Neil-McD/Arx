#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
WEB_AGENT_MEMBERS_HOOK="apps/web/src/controllers/useWebCommunityAgentMembersLifecycle.ts"
SHARED_HOOK="shared/useCommunityAgentDraftController.ts"

echo "== Community AI-agent draft controller regression checks =="

echo "[1/6] App shells should import shared AI-agent draft controller..."
if ! grep -q 'from "../shared/useCommunityAgentDraftController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityAgentDraftController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityAgentDraftController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityAgentDraftController"
  exit 1
fi

echo "[2/6] Shared AI-agent draft controller should exist and export expected API..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if ! grep -q "export function useCommunityAgentDraftController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityAgentDraftController export"
  exit 1
fi

echo "[3/6] App shells should instantiate the shared AI-agent draft controller..."
if ! grep -q "useCommunityAgentDraftController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityAgentDraftController"
  exit 1
fi
if ! grep -q "useCommunityAgentDraftController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityAgentDraftController"
  exit 1
fi

echo "[4/6] App shells should not define local AI-agent draft RPC handlers..."
for pattern in \
  "function loadCommunityAgentDrafts(" \
  "function handleSaveCommunityAgentDraft(" \
  "function persistCommunityAgentTemplateName(" \
  "function handleSetLiveCommunityAgentDraft("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/6] AI-agent draft UI should remain wired to extracted handlers in both shells..."
if ! grep -q "void loadCommunityAgentDrafts(activeCommunityId, supabaseSession);" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing binding: void loadCommunityAgentDrafts(activeCommunityId, supabaseSession);"
  exit 1
fi
if ! grep -q "void loadCommunityAgentDrafts(activeCommunityId, supabaseSession);" "$WEB_APP" \
  && ! grep -q "void params.loadCommunityAgentDrafts(params.activeCommunityId, params.supabaseSession);" "$WEB_AGENT_MEMBERS_HOOK"; then
  echo "FAIL: web app missing binding: loadCommunityAgentDrafts lifecycle invocation"
  exit 1
fi
for pattern in \
  "await persistCommunityAgentTemplateName(" \
  "onClick={() => void handleSaveCommunityAgentDraft()}" \
  "void handleSetLiveCommunityAgentDraft();"; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app missing binding: $pattern"
    exit 1
  fi
  if ! grep -q "$pattern" "$WEB_APP" && ! grep -q "$pattern" "$WEB_AGENT_MEMBERS_HOOK"; then
    echo "FAIL: web app missing binding: $pattern"
    exit 1
  fi
done

echo "[6/6] AI-agent draft RPC literals should move out of app shells into shared hook..."
for pattern in \
  "list_community_agent_drafts" \
  "upsert_community_agent_draft" \
  "set_active_community_agent_draft"; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still contains AI-agent draft RPC literal: $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still contains AI-agent draft RPC literal: $pattern"
    exit 1
  fi
  if ! grep -q "$pattern" "$SHARED_HOOK"; then
    echo "FAIL: shared hook missing AI-agent draft RPC literal: $pattern"
    exit 1
  fi
done

echo "PASS: community AI-agent draft controller regression checks passed."
