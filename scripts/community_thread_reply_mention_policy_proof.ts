import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const mentionAutocomplete = read("apps/web/src/components/communityMentionAutocomplete.tsx");
const interactionProjection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const baseCss = read("apps/web/src/base.css");
const mutationController = read("shared/useCommunityChatMutationController.ts");
const app = read("apps/web/src/App.tsx");
const packageJson = read("package.json");

assert.match(
  chatPanel,
  /type CommunityReplyTarget = Pick<CommunityChatMessage, "id" \| "sender_id" \| "body"> & \{[\s\S]*interaction_root_id\?: string \| null;[\s\S]*interaction_reply_id\?: string \| null;[\s\S]*legacy_message_id\?: string \| null;/,
  "drawer reply targets must carry an explicit canonical interaction reply id",
);
assert.match(
  mentionAutocomplete,
  /export function committedMentionFromCandidate\([\s\S]*kind === "user" && !normalizedHandle[\s\S]*kind === "community_agent"[\s\S]*agentKey: "community_agent"/,
  "autocomplete and reply seeding must share one user/community-agent mention conversion",
);
assert.match(
  chatPanel,
  /onStartRootReply=\{\(message\) => \{[\s\S]*const seededMention = committedMentionFromCandidate\(message\.mention_candidate\);[\s\S]*setDrawerReplyTarget\(message\);[\s\S]*setDrawerReplyInput\(`\$\{seededMention\.token\} `\);[\s\S]*setDrawerReplyMentions\(\[seededMention\]\);[\s\S]*!textContainsMentionToken\(drawerReplyInput, seededMention\.token\)[\s\S]*setDrawerReplyInput\(`\$\{seededMention\.token\} \$\{drawerReplyInput\.trimStart\(\)\}`\)/,
  "clicking reply should seed the canonical human or community-agent token",
);
assert.doesNotMatch(
  chatPanel,
  /function buildUserMentionFromProfile/,
  "reply seeding must not keep a parallel human-profile-only mention builder",
);
assert.doesNotMatch(
  chatPanel,
  /community-interaction-reply-composer-context|community-interaction-reply-composer-copy|isQuotingDrawerReply/,
  "thread drawer reply composer should rely on the seeded @handle instead of a separate Replying to context row",
);
assert.match(
  mentionAutocomplete,
  /export function handleMentionTokenBackspace\([\s\S]*event\.key !== "Backspace"[\s\S]*findMentionRangeForBackspace[\s\S]*textarea\.setSelectionRange\(range\.start, range\.end\)[\s\S]*const deleteEnd = value\[range\.end\] === " " \? range\.end \+ 1 : range\.end;[\s\S]*setMentions\(\(prev\) => prev\.filter\(\(mention\) => textContainsMentionToken\(nextValue, mention\.token\)\)\);/,
  "committed mentions should backspace like chips: first select the whole token, then delete it and its inserted spacer",
);
assert.equal(
  (chatPanel.match(/handleMentionTokenBackspace\(\{/g) ?? []).length,
  2,
  "both main and drawer composers should use the committed-mention backspace handler",
);
assert.match(
  chatPanel,
  /handleMentionTokenBackspace\(\{[\s\S]*mentions: communityMessageMentions,[\s\S]*applyText: onCommunityMessageInputChange,[\s\S]*setMentions: setCommunityMessageMentions,/,
  "main community composer must select/delete committed mention tokens on Backspace",
);
assert.match(
  chatPanel,
  /handleMentionTokenBackspace\(\{[\s\S]*mentions: drawerReplyMentions,[\s\S]*applyText: handleDrawerReplyInputChange,[\s\S]*setMentions: setDrawerReplyMentions,/,
  "thread drawer composer must select/delete committed mention tokens on Backspace",
);
assert.match(
  chatPanel,
  /const drawerReplyAutoSeedTokenRef = useRef<string \| null>\(null\);[\s\S]*value\.trim\(\) !== autoSeedToken[\s\S]*drawerReplyAutoSeedTokenRef\.current = null;[\s\S]*const canReplaceAutoSeed = Boolean\(autoSeedToken && drawerReplyInput\.trim\(\) === autoSeedToken\);[\s\S]*drawerReplyAutoSeedTokenRef\.current = seededMention\.token;[\s\S]*else if \(!seededMention && canReplaceAutoSeed\) \{[\s\S]*setDrawerReplyInput\(""\);[\s\S]*setDrawerReplyMentions\(\[\]\);[\s\S]*drawerReplyAutoSeedTokenRef\.current = null;/,
  "untouched seeded @handle text should be replaceable when the user clicks a different reply",
);
assert.match(
  interactionProjection,
  /reply\.actor_type === "community_agent"[\s\S]*userId: "community_agent"[\s\S]*kind: "community_agent"[\s\S]*reply\.actor_user_id && normalizedHandle[\s\S]*kind: "user"/,
  "thread reply actions must resolve both community-agent and human mention identities",
);
assert.match(
  interactionProjection,
  /onReply=\{replyMentionCandidate && props\.onStartRootReply[\s\S]*mention_candidate: replyMentionCandidate,[\s\S]*interaction_reply_id: reply\.id,[\s\S]*legacy_message_id: reply\.legacy_message_id \?\? null,/,
  "mentionable thread replies must pass identity and canonical reply id together",
);
assert.doesNotMatch(
  interactionProjection,
  /if \(!reply\.actor_user_id\) return/,
  "community-agent replies must not silently no-op behind a visible Reply action",
);
assert.match(
  mutationController,
  /interaction_reply_id\?: string \| null;/,
  "send drafts must preserve canonical interaction reply ids",
);
assert.match(
  mutationController,
  /const interactionReplyToId = String\(replySnapshot\?\.interaction_reply_id \?\? ""\)\.trim\(\) \|\| null;[\s\S]*const canonicalReplyToMessageId = interactionReplyToId \?\? legacyReplyToMessageId;/,
  "canonical sends should prefer the explicit interaction reply id before falling back to legacy chat ids",
);
assert.match(
  mutationController,
  /createCanonicalMessageRows\(\{[\s\S]*rootId: sendRoute\.rootId,[\s\S]*replyToMessageId: canonicalReplyToMessageId,/,
  "canonical thread replies must submit the hidden target reply id",
);
assert.match(
  mutationController,
  /createCloudThreadUserMessageRows[\s\S]*replyToId: legacyReplyToMessageId,/,
  "legacy chat sends must keep using legacy chat reply ids",
);
assert.match(
  app,
  /target_reply_id: p\.replyToMessageId,/,
  "optimistic canonical replies should keep the same hidden target pointer",
);
assert.doesNotMatch(
  interactionProjection,
  /<QuoteChip|reply\.target_reply_id \? \([\s\S]*community-interaction-quote/,
  "canonical thread replies should not render a visible quote chip; @handle is the visible convention",
);
assert.doesNotMatch(
  interactionFeed,
  /export function QuoteChip|community-interaction-quote|CornerUpLeft/,
  "deleted canonical quote-chip component should stay deleted",
);
assert.doesNotMatch(
  baseCss,
  /community-interaction-quote|community-interaction-reply-composer-context|community-interaction-reply-composer-copy/,
  "deleted canonical quote-chip and drawer reply-context styles should stay deleted",
);
assert.match(
  packageJson,
  /"check:community-thread-reply-mention-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_thread_reply_mention_policy_proof\.ts"/,
  "package scripts should expose the thread reply mention proof",
);

console.log("community_thread_reply_mention_policy_proof: ok");
