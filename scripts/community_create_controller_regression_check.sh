#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP="src/App.tsx"
WEB_APP="apps/web/src/App.tsx"
SHARED_HOOK="shared/useCommunityCreateController.ts"
SHARED_SLUG="shared/communitySlug.ts"
SHARED_SETTINGS_HOOK="shared/useCommunitySettingsGovernanceController.ts"
WEB_POST_AUTH_BILLING_HOOK="apps/web/src/controllers/useWebPostAuthBillingLifecycle.ts"

echo "== Community create controller regression checks =="

echo "[1/9] App shells should import shared create controller + slug utility..."
if ! grep -q 'from "../shared/useCommunityCreateController"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing useCommunityCreateController"
  exit 1
fi
if ! grep -q 'from "../../../shared/useCommunityCreateController"' "$WEB_APP"; then
  echo "FAIL: web app is not importing useCommunityCreateController"
  exit 1
fi
if ! grep -q 'from "../shared/communitySlug"' "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not importing communitySlug"
  exit 1
fi
if ! grep -q 'from "../../../shared/communitySlug"' "$WEB_APP"; then
  echo "FAIL: web app is not importing communitySlug"
  exit 1
fi

echo "[2/9] Shared create controller + slug utility must exist and export expected APIs..."
if [[ ! -f "$SHARED_HOOK" ]]; then
  echo "FAIL: $SHARED_HOOK is missing"
  exit 1
fi
if [[ ! -f "$SHARED_SLUG" ]]; then
  echo "FAIL: $SHARED_SLUG is missing"
  exit 1
fi
if ! grep -q "export function useCommunityCreateController" "$SHARED_HOOK"; then
  echo "FAIL: $SHARED_HOOK missing useCommunityCreateController export"
  exit 1
fi
if ! grep -q "export function slugifyCommunityName" "$SHARED_SLUG"; then
  echo "FAIL: $SHARED_SLUG missing slugifyCommunityName export"
  exit 1
fi
if ! grep -q "export function isValidCommunitySlug" "$SHARED_SLUG"; then
  echo "FAIL: $SHARED_SLUG missing isValidCommunitySlug export"
  exit 1
fi

echo "[3/9] App shells should instantiate the shared create controller..."
if ! grep -q "useCommunityCreateController<" "$DESKTOP_APP"; then
  echo "FAIL: desktop app is not instantiating useCommunityCreateController"
  exit 1
fi
if ! grep -q "useCommunityCreateController<" "$WEB_APP"; then
  echo "FAIL: web app is not instantiating useCommunityCreateController"
  exit 1
fi

echo "[4/9] App shells should not define local create-community handlers..."
for pattern in \
  "function openCreateCommunityModal(" \
  "function closeCreateCommunityModal(" \
  "function buildCreateCommunityDraftFromState(" \
  "function createCommunityFromDraft(" \
  "function handleCreateCommunityPrimaryAction(" \
  "function handleCreateCommunity(" \
  "function handleCreateCommunityAvatarUpload(" \
  "function handleCreateCommunityBannerUpload(" \
  "function handleCreateBannerDrop(" \
  "function handleCreateAvatarDrop("; do
  if grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop app still defines local $pattern"
    exit 1
  fi
  if grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web app still defines local $pattern"
    exit 1
  fi
done

echo "[5/9] Desktop should preserve sign-in-first create behavior..."
if ! grep -q "onPrimaryUnauthenticated: async () => {" "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing onPrimaryUnauthenticated wiring"
  exit 1
fi
if ! grep -q "await handleSignIn();" "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing handleSignIn handoff"
  exit 1
fi
if ! grep -q "buildDraftOnPrimaryUnauthenticated: false" "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing buildDraftOnPrimaryUnauthenticated: false"
  exit 1
fi
if ! grep -q "buildDraftOnCreateUnauthenticated: false" "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing buildDraftOnCreateUnauthenticated: false"
  exit 1
fi
if ! grep -q 'createUnauthenticatedErrorMessage: "Sign in to create a community."' "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing unauthenticated error message"
  exit 1
fi
if ! grep -q "showAppToastMessage(\"You've built the maximum number of communities\")" "$DESKTOP_APP"; then
  echo "FAIL: desktop create controller missing owned-limit toast wiring"
  exit 1
fi

echo "[6/9] Web should preserve auth-intent + post-create role/view updates..."
if ! grep -q "onPrimaryUnauthenticated: (draft) => {" "$WEB_APP"; then
  echo "FAIL: web create controller missing onPrimaryUnauthenticated wiring"
  exit 1
fi
if ! grep -q 'openAuthGate({ reason: "create_community", payload: { draft_id: draft?.id ?? null } })' "$WEB_APP"; then
  echo "FAIL: web create controller missing create_community auth intent handoff"
  exit 1
fi
if ! grep -q "buildDraftOnPrimaryUnauthenticated: true" "$WEB_APP"; then
  echo "FAIL: web create controller missing buildDraftOnPrimaryUnauthenticated: true"
  exit 1
fi
if ! grep -q "buildDraftOnCreateUnauthenticated: true" "$WEB_APP"; then
  echo "FAIL: web create controller missing buildDraftOnCreateUnauthenticated: true"
  exit 1
fi
if ! grep -q "setCommunityRoleById((prev) => ({ ...prev, \\[community.id\\]: \"owner\" }))" "$WEB_APP"; then
  echo "FAIL: web create controller missing owner role map update"
  exit 1
fi
if ! grep -q 'setActiveView("home");' "$WEB_APP"; then
  echo "FAIL: web create controller missing active view reset"
  exit 1
fi

echo "[7/9] Billing-return finalize path should still call createCommunityFromDraft..."
if ! grep -q "await createCommunityFromDraft(draft, supabaseSession);" "$DESKTOP_APP"; then
  echo "FAIL: desktop builder billing return flow missing createCommunityFromDraft call"
  exit 1
fi
if ! grep -q "await createCommunityFromDraft(draft, supabaseSession);" "$WEB_APP" \
  && ! grep -q "await params.createCommunityFromDraft(draft, params.supabaseSession);" "$WEB_POST_AUTH_BILLING_HOOK"; then
  echo "FAIL: web builder billing return flow missing createCommunityFromDraft call (app or post-auth billing hook)"
  exit 1
fi
if ! grep -q "if (builderBillingReturn.source === \"desktop\") return;" "$WEB_APP" \
  && ! grep -q "if (params.builderBillingReturn?.source === \"desktop\") return;" "$WEB_POST_AUTH_BILLING_HOOK"; then
  echo "FAIL: web builder billing return flow missing desktop-source guard (app or post-auth billing hook)"
  exit 1
fi

echo "[8/9] Create-community modal UI should still bind shared handlers..."
if ! grep -q "onOpenCreateCommunity={openCreateCommunityModal}" "$DESKTOP_APP"; then
  echo "FAIL: desktop shell missing openCreateCommunityModal binding"
  exit 1
fi
if ! grep -q "onClick={() => openCreateCommunityModal()}" "$WEB_APP"; then
  echo "FAIL: web shell missing openCreateCommunityModal button binding"
  exit 1
fi
for pattern in \
  "onClick={() => void handleCreateCommunityPrimaryAction()}" \
  "onClick={closeCreateCommunityModal}" \
  "onDrop={handleCreateBannerDrop}" \
  "onDrop={handleCreateAvatarDrop}" \
  "void handleCreateCommunityBannerUpload(" \
  "void handleCreateCommunityAvatarUpload("; do
  if ! grep -q "$pattern" "$DESKTOP_APP"; then
    echo "FAIL: desktop create modal missing $pattern binding"
    exit 1
  fi
  if ! grep -q "$pattern" "$WEB_APP"; then
    echo "FAIL: web create modal missing $pattern binding"
    exit 1
  fi
done

echo "[9/9] App shells should use shared slug utility and avoid local slug helpers..."
if ! grep -q "slugifyCommunityName(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app missing slugifyCommunityName usage"
  exit 1
fi
if ! grep -q "slugifyCommunityName(" "$WEB_APP"; then
  echo "FAIL: web app missing slugifyCommunityName usage"
  exit 1
fi
if ! grep -q "isValidCommunitySlug(" "$DESKTOP_APP" \
  && ! grep -q "isValidCommunitySlug(" "$SHARED_HOOK" \
  && ! grep -q "isValidCommunitySlug(" "$SHARED_SETTINGS_HOOK"; then
  echo "FAIL: missing isValidCommunitySlug usage in desktop shell or shared community controllers"
  exit 1
fi
if ! grep -q "isValidCommunitySlug(" "$WEB_APP" \
  && ! grep -q "isValidCommunitySlug(" "$SHARED_HOOK" \
  && ! grep -q "isValidCommunitySlug(" "$SHARED_SETTINGS_HOOK"; then
  echo "FAIL: missing isValidCommunitySlug usage in web shell or shared community controllers"
  exit 1
fi
if grep -q "function slugify(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local slugify"
  exit 1
fi
if grep -q "function isValidSlug(" "$DESKTOP_APP"; then
  echo "FAIL: desktop app still defines local isValidSlug"
  exit 1
fi
if grep -q "function slugify(" "$WEB_APP"; then
  echo "FAIL: web app still defines local slugify"
  exit 1
fi
if grep -q "function isValidSlug(" "$WEB_APP"; then
  echo "FAIL: web app still defines local isValidSlug"
  exit 1
fi

echo "PASS: community create controller regression checks passed."
