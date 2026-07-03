import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const interactions = read("convex/communityInteractions.ts");
const mentionEmails = read("convex/communityMentionEmails.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const profileHandle = read("shared/profileHandle.ts");

assert.match(
  interactions,
  /const EVERYBODY_MENTION_ROLE_KEY = "everybody"/,
  "@everybody must have one canonical backend role key",
);

assert.match(
  profileHandle,
  /RESERVED_PROFILE_HANDLES[\s\S]*"everybody"/,
  "@everybody must be reserved out of the user handle namespace",
);

assert.match(
  interactions,
  /MAX_EVERYBODY_MENTION_RECIPIENTS = 100/,
  "@everybody fanout must have a hard MVP recipient cap",
);

assert.match(
  interactions,
  /const broadcastRecipientKeys = new Set<string>\(\)[\s\S]*if \(broadcastRecipientKeys\.has\(recipientKey\)\) return[\s\S]*broadcastRecipientKeys\.size >= MAX_EVERYBODY_MENTION_RECIPIENTS[\s\S]*broadcastRecipientKeys\.add\(recipientKey\)/,
  "@everybody must cap unique actual recipients, including direct mentions that overlap with the broadcast",
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
  /resolveEverybodyMentionRecipientsForWrite[\s\S]*requireCommunityManager\(\{[\s\S]*userId: args\.actorUserId/,
  "@everybody must use the owner/admin manager boundary, not the moderator boundary",
);

assert.doesNotMatch(
  interactions.match(/async function resolveEverybodyMentionRecipientsForWrite[\s\S]*?return resolved;\n\}/)?.[0] ?? "",
  /requireCommunityModerator/,
  "moderators must not inherit @everybody permission through the broadcast resolver",
);

assert.match(
  interactions,
  /const actorKey = normalizeIdValue\(args\.actorUserId\)[\s\S]*if \(!recipientKey \|\| recipientKey === actorKey\) return/,
  "@everybody must never enqueue a recipient row for the sender",
);

assert.match(
  interactions,
  /communityMembershipRowIsActive\(row as any\)[\s\S]*await addRecipient\(row\.userId\)/,
  "@everybody must only consider active community membership rows for fanout",
);

assert.match(
  interactions,
  /await requireCommunityChatAccess\(\{[\s\S]*userId: targetUserId[\s\S]*\}\);[\s\S]*catch \{[\s\S]*return;/,
  "@everybody fanout recipients must pass the same chat access gate as direct mentions",
);

assert.match(
  interactions,
  /existing\.sourceRoleKey = EVERYBODY_MENTION_ROLE_KEY/,
  "a direct mention that is also inside @everybody must retain broadcast-origin metadata",
);

assert.match(
  interactions,
  /sourceRoleKey: EVERYBODY_MENTION_ROLE_KEY/,
  "@everybody-created recipient specs must carry broadcast-origin metadata",
);

assert.match(
  interactions,
  /spec\.kind === "user" && spec\.sourceRoleKey \? \{ mentionedRoleKey: spec\.sourceRoleKey \}/,
  "broadcast-origin recipient rows must stay user mention rows with mentionedRoleKey metadata",
);

assert.match(
  mentionEmails,
  /q\.eq\("mentionKind", "user"\)\.eq\("notifyState", "pending"\)/,
  "mention email processing must continue to see @everybody recipient rows because they are user rows",
);

assert.match(
  interactions,
  /listMentionRowsForInteractionLifecycle[\s\S]*\.collect\(\)/,
  "edit/delete suppression must collect the full lifecycle row set, not the 24-row projection bundle",
);

assert.match(
  interactions,
  /for \(const reply of replies\) \{[\s\S]*listMentionRowsForInteractionLifecycle\(\{[\s\S]*targetType: "reply"[\s\S]*targetId: reply\._id/,
  "deleting a root must suppress full reply fanout rows, not only the 24-row reply projection bundle",
);

assert.match(
  interactions,
  /row\.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY[\s\S]*interactionTextContainsRoleMention\(args\.text, EVERYBODY_MENTION_ROLE_KEY\)[\s\S]*continue;/,
  "@everybody-origin pending rows must survive edits that keep the visible @everybody token",
);

assert.match(
  interactions,
  /interaction_mention_everybody_no_recipients/,
  "@everybody must fail closed instead of creating an unaudited no-op broadcast",
);

console.log("community_everybody_mention_contract_proof: ok");
