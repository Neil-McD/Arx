import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const schema = read("convex/schema.ts");
const lifecycle = read("convex/communityMentionLifecycle.ts");
const attention = read("convex/communityAttention.ts");
const mentionEmails = read("convex/communityMentionEmails.ts");
const readCursorCore = read("convex/communityReadCursorCore.ts");
const interactions = read("convex/communityInteractions.ts");
const packageJson = read("package.json");

assert.match(
  packageJson,
  /"check:community-mention-lifecycle-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_mention_lifecycle_contract_proof\.ts"/,
  "package.json must expose the mention lifecycle proof",
);

assert.match(
  schema,
  /\.index\("by_mentionKind_notifyState_createdAt", \["mentionKind", "notifyState", "createdAt"\]\)/,
  "mention email scans must be structurally scoped by mention kind and notify state",
);

assert.match(
  schema,
  /\.index\("by_mentionedUser_community_notifyState_createdAt", \["mentionedUserId", "communityId", "notifyState", "createdAt"\]\)/,
  "mention lifecycle reads must be able to scope one user and community without touching unrelated rows",
);

assert.match(
  lifecycle,
  /settleMentionRowInternal[\s\S]*row\.notifyState !== "pending"[\s\S]*notifyState: args\.toState/,
  "the shared mention settlement primitive must only advance pending rows",
);

assert.match(
  mentionEmails,
  /withIndex\("by_mentionKind_notifyState_createdAt"[\s\S]*eq\("mentionKind", "user"\)\.eq\("notifyState", "pending"\)/,
  "mention email processing must scan only pending user mentions, never agent mentions",
);

assert.doesNotMatch(
  mentionEmails,
  /withIndex\("by_notifyState_createdAt"[\s\S]*eq\("notifyState", "pending"\)/,
  "mention email processing must not use a kind-blind pending scan",
);

assert.match(
  mentionEmails,
  /suppressOnlyJob[\s\S]*resolveMentionRecipientSource[\s\S]*if \(!authorized\)[\s\S]*suppressOnlyJob\(mention\)/,
  "dead-source user mention rows must drain to suppressed instead of staying pending forever",
);

assert.match(
  read("convex/communityNotificationAccess.ts"),
  /resolveCommunityInteractionEvidenceSource[\s\S]*communityInteractionEvidenceSourceIsReadable\(source\)/,
  "notification eligibility must reuse the canonical source-and-parent readability check",
);

assert.match(
  mentionEmails,
  /let emailJobsThisRun = 0[\s\S]*if \(emailJobsThisRun >= MENTION_EMAIL_BATCH_LIMIT\) continue[\s\S]*emailJobsThisRun \+= 1/,
  "the email batch limit must cap actual email sends, not suppression cleanup",
);

assert.doesNotMatch(
  mentionEmails,
  /if \(jobs\.length >= MENTION_EMAIL_BATCH_LIMIT\) break/,
  "dead-row suppression must not be throttled by the outbound email batch cap",
);

assert.match(
  mentionEmails,
  /authorUserId[\s\S]*normalizeIdValue\(authorUserId\) === normalizeIdValue\(mention\.mentionedUserId\)[\s\S]*suppressOnlyJob\(mention\)/,
  "self-mentions must drain to suppressed instead of staying pending forever",
);

assert.match(
  read("convex/communityNotificationAccess.ts"),
  /if \(!community \|\| !communityIsActive\(community\)\) return null/,
  "mentions whose community disappeared must drain to suppressed",
);

assert.match(
  mentionEmails,
  /settleMentionRowInternal\(\{[\s\S]*toState: update\.notifyState/,
  "email mark-state mutation must use the guarded settlement primitive",
);

assert.match(
  readCursorCore,
  /readCommunityChatReadState[\s\S]*mentionSeenThroughAt/,
  "mention visibility must derive from the canonical chat read cursor",
);

assert.match(
  mentionEmails,
  /readCommunityChannelReadState[\s\S]*readOnlyJob\(mention\)[\s\S]*notifyState: "read"/,
  "pending mentions covered by the cursor must settle asynchronously without email",
);

assert.match(
  attention,
  /for \(const notifyState of \["pending", "sent", "read"\] as const\)[\s\S]*by_mentionedUser_community_notifyState_createdAt/,
  "mention attention must ignore suppressed mention rows",
);

assert.doesNotMatch(
  attention,
  /by_mentionedUser_community_createdAt/,
  "suppressed mentions must not remain visible to mention attention",
);

assert.doesNotMatch(
  attention,
  /settleMentionRowInternal|eq\("notifyState", "pending"\)/,
  "chat acknowledgement must remain one bounded cursor write with no mention-row fanout",
);

assert.match(
  interactions,
  /suppressPendingMentionsForInteractionSource[\s\S]*listMentionRowsForInteractionLifecycle/,
  "interaction source mention settlement must use the lifecycle mention row reader",
);

assert.match(
  interactions,
  /MAX_INTERACTION_MENTION_LIFECYCLE_ROWS[\s\S]*\.take\(MAX_INTERACTION_MENTION_LIFECYCLE_ROWS\)/,
  "source lifecycle scans must stay bounded so mass-mention fanout cannot make edit/delete unbounded",
);

assert.match(
  interactions,
  /suppressPendingMentionsMissingFromInteractionText[\s\S]*row\.notifyState !== "pending"[\s\S]*interactionTextContainsHandleMention\(args\.text, user\.handle \?\? user\.normalizedHandle\)[\s\S]*continue;[\s\S]*suppressPendingMentionRows/,
  "editing an interaction source must preserve pending mentions whose @handle still appears in the edited text",
);
assert.match(
  interactions,
  /suppressPendingMentionsMissingFromInteractionText[\s\S]*row\.mentionKind === "community_agent"[\s\S]*row\.mentionedAgentKey === "community_agent"[\s\S]*interactionTextContainsCommunityAgentMention\(\{[\s\S]*communityId: row\.communityId[\s\S]*text: args\.text[\s\S]*continue;/,
  "editing an interaction source must preserve pending community-agent mentions whose visible community-agent token still appears",
);

assert.match(
  interactions,
  /suppressPendingMentionRows[\s\S]*toState: "suppressed"/,
  "deleted-source mention settlement must suppress pending mention rows",
);

assert.match(
  interactions,
  /editCommunityInteractionTargetCore[\s\S]*suppressPendingMentionsMissingFromInteractionText/,
  "the canonical edit core must suppress only stale pending mention notifications",
);
assert.match(
  interactions,
  /editCommunityInteractionMessage[\s\S]*editCommunityInteractionTargetCore/,
  "the public canonical edit mutation must route through the guarded edit core",
);

assert.match(
  interactions,
  /suppressPendingMentionsForDeletedInteractionTarget[\s\S]*cancelEverybodyMentionBroadcastsForInteractionSource[\s\S]*includeReplySources: args\.targetType === "root"[\s\S]*by_root_createdAt/,
  "deleting an interaction root must cancel source broadcasts and also suppress pending direct mentions in child replies",
);

assert.match(
  interactions,
  /status: "deleted"[\s\S]*suppressPendingMentionsForDeletedInteractionTarget/,
  "deleteCommunityInteractionMessage must suppress source mentions after tombstoning the target",
);

console.log("community_mention_lifecycle_contract_proof: ok");
