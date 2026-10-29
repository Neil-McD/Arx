import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const packageJson = read("package.json");

assert.doesNotMatch(
  chatPanel,
  /COMMUNITY_COMPOSER_IDEA_PLACEHOLDER_INTERVAL_MS|COMMUNITY_COMPOSER_REDUCED_MOTION_MEDIA_QUERY|buildCommunityComposerIdeaPlaceholders|communityComposerIdeaPlaceholderIndex/,
  "community composer placeholder must not rotate",
);
assert.match(
  chatPanel,
  /const activeCommunityChannelSlug = String\(interactionProjection\?\.activeChannel\?\.slug \?\? ""\)\.trim\(\);/,
  "community composer destination must come from the selected channel slug",
);
assert.match(
  chatPanel,
  /const activeCommunityComposerPlaceholder = [\s\S]*: activeCommunityChannelSlug[\s\S]*`Message #\$\{activeCommunityChannelSlug\}`[\s\S]*: "Message the community\.\.\.";/,
  "community composer placeholder must identify the selected channel with a safe fallback",
);
assert.match(
  chatPanel,
  /const mainCommunityComposerPlaceholder = !hasSession[\s\S]*"Sign in to chat\.\.\."[\s\S]*"Restoring your account\.\.\."[\s\S]*"Loading community\.\.\."[\s\S]*"Select a community to chat\.\.\."[\s\S]*"Finish your profile to chat\.\.\."[\s\S]*"Join this community to chat\.\.\."[\s\S]*activeCommunityComposerPlaceholder;/,
  "existing disabled/loading/join placeholders must remain deterministic",
);
assert.match(
  chatPanel,
  /aria-label=\{mainCommunityComposerPlaceholder\}[\s\S]*placeholder=\{mainCommunityComposerPlaceholder\}/,
  "main composer textarea must use the destination copy for its accessible label and placeholder",
);
assert.match(
  chatPanel,
  /const drawerReplyPlaceholder = drawerReplyTarget\?\.sender_id[\s\S]*`Reply to \$\{drawerReplyTarget\.reply_author_label\?\.trim\(\) \|\| displayName\(drawerReplyTarget\.sender_id\)\.trim\(\) \|\| "this message"\}\.\.\.`[\s\S]*: "Reply\.\.\.";/,
  "thread reply composer placeholder must include the target display name with a Reply fallback",
);
assert.match(
  chatPanel,
  /placeholder=\{drawerReplyPlaceholder\}/,
  "thread reply composer textarea must use the computed reply target placeholder",
);
assert.match(
  packageJson,
  /"check:community-composer-placeholder-policy-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_composer_placeholder_policy_proof\.ts"/,
  "package scripts should expose the community composer placeholder proof",
);

console.log("community_composer_placeholder_policy_proof: ok");
