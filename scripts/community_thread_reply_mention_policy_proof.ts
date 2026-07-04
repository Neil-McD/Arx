import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
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
  chatPanel,
  /function buildUserMentionFromProfile\([\s\S]*profile\?\.handle[\s\S]*replace\(\/\^@\+\/, ""\)[\s\S]*token: `@\$\{handle\}`,[\s\S]*kind: "user"/,
  "reply-to-reply mention seeding must use the user's real handle token",
);
assert.match(
  chatPanel,
  /onStartRootReply=\{\(message\) => \{[\s\S]*const seededMention = buildUserMentionFromProfile\([\s\S]*message\.sender_id,[\s\S]*profilesByUserId\[message\.sender_id\][\s\S]*setDrawerReplyTarget\(message\);[\s\S]*if \(seededMention && canSeedMention\) \{[\s\S]*setDrawerReplyInput\(`\$\{seededMention\.token\} `\);[\s\S]*setDrawerReplyMentions\(\[seededMention\]\);/,
  "clicking reply on a thread reply should seed @handle when the drawer composer can accept an auto seed",
);
assert.match(
  chatPanel,
  /const drawerReplyAutoSeedTokenRef = useRef<string \| null>\(null\);[\s\S]*value\.trim\(\) !== autoSeedToken[\s\S]*drawerReplyAutoSeedTokenRef\.current = null;[\s\S]*const canReplaceAutoSeed = Boolean\(autoSeedToken && drawerReplyInput\.trim\(\) === autoSeedToken\);[\s\S]*drawerReplyAutoSeedTokenRef\.current = seededMention\.token;[\s\S]*else if \(!seededMention && canReplaceAutoSeed\) \{[\s\S]*setDrawerReplyInput\(""\);[\s\S]*setDrawerReplyMentions\(\[\]\);[\s\S]*drawerReplyAutoSeedTokenRef\.current = null;/,
  "untouched seeded @handle text should be replaceable when the user clicks a different reply",
);
assert.match(
  interactionProjection,
  /props\.onStartRootReply\?\.\(\{[\s\S]*id: reply\.legacy_message_id \?\? reply\.id,[\s\S]*interaction_root_id: reply\.root_id,[\s\S]*interaction_reply_id: reply\.id,[\s\S]*legacy_message_id: reply\.legacy_message_id \?\? null,/,
  "reply actions inside the thread must pass the canonical reply id to the drawer composer",
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
  /community-interaction-quote/,
  "deleted canonical quote-chip styles should stay deleted",
);
assert.match(
  packageJson,
  /"check:community-thread-reply-mention-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_thread_reply_mention_policy_proof\.ts"/,
  "package scripts should expose the thread reply mention proof",
);

console.log("community_thread_reply_mention_policy_proof: ok");
