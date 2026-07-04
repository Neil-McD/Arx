import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const packageJson = read("package.json");

assert.match(
  chatPanel,
  /const COMMUNITY_COMPOSER_IDEA_PLACEHOLDER_INTERVAL_MS = 6500;/,
  "community composer idea placeholder should rotate slowly",
);
assert.match(
  chatPanel,
  /const COMMUNITY_COMPOSER_REDUCED_MOTION_MEDIA_QUERY = "\(prefers-reduced-motion: reduce\)";/,
  "community composer placeholder rotation must respect reduced motion",
);
assert.match(
  chatPanel,
  /function buildCommunityComposerIdeaPlaceholders\([\s\S]*"Ask the community a question\.\.\."[\s\S]*"Share what you are working on\.\.\."[\s\S]*"Type @ to tag a member\.\.\."[\s\S]*`Tag @\$\{agentName\} to ask the community agent\.\.\.`/,
  "placeholder ideas must include chat, member tag, and agent tag prompts",
);
assert.doesNotMatch(
  chatPanel,
  /Use @everybody for updates everyone should see/,
  "main composer idea placeholders must not promote @everybody",
);
assert.match(
  chatPanel,
  /const canShowMainComposerIdeaPlaceholder = Boolean\([\s\S]*hasSession[\s\S]*activeCommunity[\s\S]*canUseComposer[\s\S]*canPostMessages[\s\S]*!isAuthRecoveringSignedIn[\s\S]*!isResolvingSelectedCommunity[\s\S]*communityMessageInput\.trim\(\)\.length === 0[\s\S]*!replyingToMessage/,
  "placeholder ideas should show only when the main composer is usable, empty, and not replying",
);
assert.match(
  chatPanel,
  /useEffect\(\(\) => \{[\s\S]*shouldReduceCommunityComposerPlaceholderMotion[\s\S]*window\.setInterval[\s\S]*setCommunityComposerIdeaPlaceholderIndex[\s\S]*COMMUNITY_COMPOSER_IDEA_PLACEHOLDER_INTERVAL_MS[\s\S]*window\.clearInterval\(intervalId\)/,
  "placeholder ideas must rotate with cleanup and reduced-motion gating",
);
assert.match(
  chatPanel,
  /shouldReduceCommunityComposerPlaceholderMotion \? 0 : communityComposerIdeaPlaceholderIndex[\s\S]*\}, \[activeCommunity\?\.id, activeCommunity\?\.name\]\);/,
  "reduced-motion users should see the first prompt and community prompt changes should reset the cycle",
);
assert.match(
  chatPanel,
  /const mainCommunityComposerPlaceholder = !hasSession[\s\S]*"Sign in to chat\.\.\."[\s\S]*"Restoring your account\.\.\."[\s\S]*"Loading community\.\.\."[\s\S]*"Select a community to chat\.\.\."[\s\S]*"Finish your profile to chat\.\.\."[\s\S]*"Join this community to chat\.\.\."[\s\S]*mainCommunityComposerIdeaPlaceholder[\s\S]*"Message the community\.\.\.";/,
  "existing disabled/loading/join placeholders must remain deterministic",
);
assert.match(
  chatPanel,
  /placeholder=\{mainCommunityComposerPlaceholder\}/,
  "main composer textarea must use the computed placeholder",
);
assert.match(
  chatPanel,
  /const drawerReplyPlaceholder = drawerReplyTarget\?\.sender_id[\s\S]*`Reply to \$\{displayName\(drawerReplyTarget\.sender_id\)\.trim\(\) \|\| "this message"\}\.\.\.`[\s\S]*: "Reply\.\.\.";/,
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
