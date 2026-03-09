#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Community public identity guard =="

COMMUNITY_FILE="convex/community.ts"
COMMUNITY_CHAT_FILE="convex/communityChat.ts"
COMMUNITY_ADMIN_FILE="convex/communityAdmin.ts"
COMMUNITY_CORE_FILE="convex/communityCore.ts"
COMMUNITY_EXPERIENCE_FILE="convex/communityExperience.ts"
COMMUNITY_LIFECYCLE_FILE="convex/communityLifecycle.ts"

if [[ ! -f "$COMMUNITY_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_CHAT_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_CHAT_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_ADMIN_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_ADMIN_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_CORE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_CORE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_EXPERIENCE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_EXPERIENCE_FILE"
  exit 1
fi
if [[ ! -f "$COMMUNITY_LIFECYCLE_FILE" ]]; then
  echo "FAIL: missing $COMMUNITY_LIFECYCLE_FILE"
  exit 1
fi

require_multiline_match() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -n -U --pcre2 "$pattern" "$file" >/dev/null; then
    echo "FAIL: missing contract marker: $description"
    exit 1
  fi
  echo "OK: $description"
}

echo "[1/9] Ensuring public user-ID resolver exists..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function resolvePublicUserId\(\s*ctx: any,\s*rawUserId: unknown,' \
  "resolvePublicUserId helper exists"

echo "[2/9] Ensuring chat and reaction payloads resolve browser-facing IDs..."
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'async function mapCommunityChatMessageRow\([\s\S]*?sender_id: await resolvePublicUserId\(ctx, row\.senderUserId, userIdCache\)' \
  "community chat rows resolve public sender IDs"
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'async function mapCommunityMessageReactionRow\([\s\S]*?user_id: \(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\? String\(row\.userId\)' \
  "community reaction rows resolve public user IDs"

echo "[3/9] Ensuring core community records resolve public owner IDs..."
require_multiline_match "$COMMUNITY_LIFECYCLE_FILE" \
  'async function mapCommunityRecord\([\s\S]*?owner_id: \(await resolvePublicUserId\(ctx, row\.ownerId, userIdCache\)\) \?\? String\(row\.ownerId\)' \
  "community records resolve public owner IDs"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMemberships = query\([\s\S]*?owner_id: \(await resolvePublicUserId\(ctx, community\.ownerId, userIdCache\)\) \?\? String\(community\.ownerId\)' \
  "membership list resolves public owner IDs"

echo "[4/9] Ensuring community access payloads resolve public user IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityAccessRow\([\s\S]*?user_id: \(await resolvePublicUserId\(args\.ctx, args\.userId\)\) \?\? String\(args\.userId\)' \
  "community access rows resolve public user IDs"

echo "[5/9] Ensuring membership and join-request admin payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityMembershipsAdmin = query\([\s\S]*?user_id: \(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\? String\(row\.userId\)' \
  "membership admin rows resolve public user IDs"
require_multiline_match "$COMMUNITY_ADMIN_FILE" \
  'export const listCommunityJoinRequests = query\([\s\S]*?user_id: \(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\? String\(row\.userId\)' \
  "join-request rows resolve public user IDs"

echo "[6/9] Ensuring invite and member-settings payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityInviteRow\([\s\S]*?created_by: \(await resolvePublicUserId\(ctx, row\.createdByUserId, userIdCache\)\) \?\? String\(row\.createdByUserId\)' \
  "invite rows resolve public creator IDs"
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityMemberSettingsRow\([\s\S]*?user_id: \(await resolvePublicUserId\(ctx, row\.userId, userIdCache\)\) \?\? String\(row\.userId\)' \
  "member settings rows resolve public user IDs"

echo "[7/9] Ensuring resource payloads resolve public IDs..."
require_multiline_match "$COMMUNITY_CORE_FILE" \
  'export async function mapCommunityResourceRow\([\s\S]*?created_by: \(await resolvePublicUserId\(ctx, row\.createdByUserId, userIdCache\)\) \?\? String\(row\.createdByUserId\)' \
  "resource rows resolve public creator IDs"

echo "[8/9] Ensuring sender-ID list hydration stays in the same public namespace..."
require_multiline_match "$COMMUNITY_CHAT_FILE" \
  'sender_id: await resolvePublicUserId\(ctx, row\.senderUserId, userIdCache\)' \
  "sender ID list hydration uses public IDs"

echo "[9/9] Guard passed."
echo "PASS: community browser-facing user references are normalized to public IDs."
