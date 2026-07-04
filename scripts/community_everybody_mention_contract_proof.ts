import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const interactions = read("convex/communityInteractions.ts");
const mentionEmails = read("convex/communityMentionEmails.ts");
const mentionBroadcasts = read("convex/communityMentionBroadcasts.ts");
const schema = read("convex/schema.ts");
const crons = read("convex/crons.ts");
const directory = read("convex/communityDirectory.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const profileHandle = read("shared/profileHandle.ts");

assert.match(
  mentionBroadcasts,
  /export const EVERYBODY_MENTION_ROLE_KEY = "everybody"/,
  "@everybody must have one canonical backend role key",
);

assert.match(
  profileHandle,
  /RESERVED_PROFILE_HANDLES[\s\S]*"everybody"/,
  "@everybody must be reserved out of the user handle namespace",
);

assert.doesNotMatch(
  interactions,
  /MAX_EVERYBODY_MENTION_RECIPIENTS|interaction_mention_everybody_limit_exceeded/,
  "@everybody must not have a synchronous 100-recipient write cap",
);

assert.match(
  schema,
  /communityMentionBroadcasts: defineTable\(\{[\s\S]*sourceMentionId: v\.id\("communityInteractionMentions"\)[\s\S]*emailMode: v\.union\([\s\S]*in_app_only[\s\S]*in_app_and_email[\s\S]*status: v\.union\([\s\S]*queued[\s\S]*draining[\s\S]*complete[\s\S]*canceled[\s\S]*membershipCursor[\s\S]*cleanupState/,
  "@everybody must have a durable broadcast ledger for batching, cooldown, and retry state",
);
assert.match(
  schema,
  /sourceBroadcastId: v\.optional\(v\.id\("communityMentionBroadcasts"\)\)[\s\S]*emailEligible: v\.optional\(v\.boolean\(\)\)[\s\S]*\.index\("by_sourceBroadcast", \["sourceBroadcastId"\]\)[\s\S]*\.index\("by_sourceBroadcast_user", \["sourceBroadcastId", "mentionedUserId"\]\)/,
  "recipient mention rows must carry broadcast idempotency and explicit email eligibility",
);

assert.match(
  interactions,
  /mentions: v\.optional\([\s\S]*roleKey: v\.optional\(v\.string\(\)\)/,
  "the canonical composer mutation must accept a hidden roleKey mention payload",
);

assert.match(
  gateway,
  /mentions\?: \{ userId\?: string; agentKey\?: string; roleKey\?: string \}\[\]/,
  "the shared composer gateway type must expose roleKey without falling back to any",
);

assert.match(
  interactions,
  /if \(mention\.roleKey\) \{[\s\S]*interaction_mention_payload_ambiguous[\s\S]*interaction_mention_role_unknown[\s\S]*interactionTextContainsRoleMention\(args\.text, roleKey\)[\s\S]*interaction_mention_token_missing/,
  "@everybody must fail closed on ambiguous payloads, unknown role keys, and missing visible tokens",
);

assert.match(
  interactions,
  /validateEverybodyMentionForWrite[\s\S]*requireCommunityManager\(\{[\s\S]*userId: args\.actorUserId/,
  "@everybody must validate the owner/admin manager boundary at write time",
);

assert.doesNotMatch(
  interactions.match(/async function validateEverybodyMentionForWrite[\s\S]*?\n\}/)?.[0] ?? "",
  /requireCommunityModerator/,
  "moderators must not inherit @everybody permission through the write validator",
);

assert.match(
  interactions,
  /out\.push\(\{ kind: "role", roleKey \}\)/,
  "@everybody writes must create a role source mention, not synchronous recipient rows",
);
assert.match(
  interactions,
  /spec\.kind === "role" \? \{ mentionedRoleKey: spec\.roleKey \}/,
  "the source role mention row must carry mentionedRoleKey for immediate render/audit truth",
);

assert.match(
  interactions,
  /scheduleEverybodyMentionBroadcast\(\{[\s\S]*actorUserId: args\.actorUserId[\s\S]*sourceMentionId: mentionId/,
  "the source role mention must create the durable broadcast request inside the chat write",
);

assert.match(
  mentionBroadcasts,
  /EVERYBODY_EMAIL_COOLDOWN_MS = 72 \* 60 \* 60 \* 1000[\s\S]*readEverybodyMentionEmailAvailability[\s\S]*emailMode: "in_app_and_email"[\s\S]*emailMode: cooldownUntil > nowMs \? "in_app_only" : "in_app_and_email"/,
  "@everybody email blast eligibility must be chosen by the 72-hour per-community cooldown ledger",
);
assert.match(
  mentionBroadcasts,
  /rows\.find\(\(row\) => row\.status !== "error" && row\.errorCode !== "no_recipients"\)/,
  "source invalidation must not let managers bypass the 72-hour email blast cooldown by deleting after sending",
);

assert.match(
  mentionBroadcasts,
  /\.query\("communityMemberships" as any\)[\s\S]*\.paginate\(\{[\s\S]*membershipCursor[\s\S]*numItems: remaining/,
  "@everybody recipient fanout must use bounded paginated membership batches",
);

assert.match(
  mentionBroadcasts,
  /communityMembershipRowIsActive\(row\)[\s\S]*processBroadcastRecipient\(\{[\s\S]*userId: row\.userId/,
  "@everybody fanout must only process active community membership rows",
);

assert.match(
  mentionBroadcasts,
  /normalizeIdValue\(args\.userId\)[\s\S]*userKey === normalizeIdValue\(args\.broadcast\.actorUserId\)[\s\S]*return "skipped"/,
  "@everybody must never enqueue a recipient row for the sender",
);

assert.match(
  mentionBroadcasts,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.broadcast\.communityId[\s\S]*userId: args\.userId[\s\S]*\}\)[\s\S]*catch \{[\s\S]*return "skipped"/,
  "@everybody fanout recipients must pass the same chat access gate as direct mentions",
);

assert.match(
  mentionBroadcasts,
  /attachBroadcastToExistingMention[\s\S]*mentionedRoleKey: EVERYBODY_MENTION_ROLE_KEY[\s\S]*sourceBroadcastId: args\.broadcast\._id/,
  "a direct mention that overlaps @everybody must be attached to the broadcast instead of duplicated",
);

assert.match(
  mentionBroadcasts,
  /mentionKind: "user"[\s\S]*mentionedRoleKey: EVERYBODY_MENTION_ROLE_KEY[\s\S]*emailEligible: args\.broadcast\.emailMode === "in_app_and_email"[\s\S]*notifyState/,
  "@everybody-created recipient rows must stay user rows with role metadata and explicit email eligibility",
);

assert.match(
  mentionBroadcasts,
  /if \(args\.emailMode === "in_app_only"\) return "sent"/,
  "in-app-only @everybody rows must bypass the pending email queue while retaining mention attention",
);

assert.match(
  mentionEmails,
  /q\.eq\("mentionKind", "user"\)\.eq\("notifyState", "pending"\)/,
  "mention email processing must continue to see @everybody recipient rows because they are user rows",
);

assert.match(
  mentionEmails,
  /mention\.emailEligible === false[\s\S]*emailSkipped: true[\s\S]*notifyState: "sent"/,
  "email-ineligible mention rows must drain to sent without enqueueing email or starving the pending scan",
);
assert.match(
  mentionEmails,
  /mentionBroadcastAllowsEmail[\s\S]*broadcastId: mention\.sourceBroadcastId[\s\S]*suppressOnlyJob\(mention\)/,
  "email workers must obey the broadcast kill switch before sending delayed @everybody email",
);

assert.match(
  mentionBroadcasts,
  /sourceIsStillBroadcastable[\s\S]*sourceMention\.notifyState !== "pending"[\s\S]*textContainsEverybodyMentionToken\(await readSourceText/,
  "the async broadcast drain must cancel if the source is deleted or edited to remove @everybody",
);

assert.match(
  mentionBroadcasts,
  /recipientCount === 0[\s\S]*cancelBroadcastWithPatch\([\s\S]*"no_recipients"/,
  "zero-recipient @everybody drains must cancel so they do not consume the 72-hour email cooldown",
);
assert.match(
  interactions,
  /cancelEverybodyMentionBroadcastsForInteractionSource[\s\S]*source_mention_removed[\s\S]*cancelEverybodyMentionBroadcastsForInteractionSource[\s\S]*source_deleted/,
  "edit/delete invalidation must cancel the durable broadcast row instead of relying on recipient scans",
);
assert.match(
  mentionBroadcasts,
  /processCanceledCommunityMentionBroadcastCleanupsInternal[\s\S]*withIndex\("by_sourceBroadcast"[\s\S]*paginate\(\{[\s\S]*cleanupCursor[\s\S]*notifyState: "suppressed"/,
  "canceled broadcast cleanup must force-suppress projected recipient rows in bounded batches",
);
assert.match(
  crons,
  /process canceled community mention broadcast cleanups[\s\S]*communityMentionBroadcasts\.processCanceledCommunityMentionBroadcastCleanupsInternal/,
  "canceled @everybody broadcast cleanup must have a repair cron",
);

assert.match(
  crons,
  /process queued community mention broadcasts[\s\S]*communityMentionBroadcasts\.processQueuedCommunityMentionBroadcastsInternal/,
  "@everybody broadcasts must have a repair cron, not rely only on best-effort immediate scheduling",
);

assert.match(
  directory,
  /readEverybodyMentionEmailAvailability[\s\S]*emails unread members after 15 min[\s\S]*email blast on cooldown/,
  "autocomplete copy must truthfully distinguish available email blast from cooldown in-app-only mode",
);

assert.doesNotMatch(
  interactions,
  /listMentionRowsForInteractionLifecycle[\s\S]*\.collect\(\)/,
  "edit/delete suppression must not collect unbounded @everybody recipient rows",
);

assert.match(
  interactions,
  /MAX_INTERACTION_MENTION_LIFECYCLE_ROWS[\s\S]*\.take\(MAX_INTERACTION_MENTION_LIFECYCLE_ROWS\)/,
  "source mention lifecycle scans must stay bounded now that broadcast recipients are cleaned by sourceBroadcastId",
);

assert.match(
  interactions,
  /row\.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY[\s\S]*interactionTextContainsRoleMention\(args\.text, EVERYBODY_MENTION_ROLE_KEY\)[\s\S]*continue;/,
  "@everybody-origin pending rows must survive edits that keep the visible @everybody token",
);

console.log("community_everybody_mention_contract_proof: ok");
