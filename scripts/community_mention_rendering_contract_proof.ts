import assert from "node:assert/strict";
import {
  splitBodyIntoMentionSegments,
  textContainsMentionToken,
  type ResolvedMentionForRendering,
} from "../shared/communityMentionRendering.ts";

function mention(overrides: Partial<ResolvedMentionForRendering> & { label: string }): ResolvedMentionForRendering {
  return {
    key: overrides.key ?? `m-${overrides.label}`,
    label: overrides.label,
    kind: overrides.kind ?? "user",
    userId: overrides.userId ?? `user-${overrides.label}`,
    isSelf: overrides.isSelf ?? false,
  };
}

// Basic match: one mention becomes a chip segment; surrounding text stays plain.
{
  const segments = splitBodyIntoMentionSegments("hey @Rhiannon Falls check this", [
    mention({ label: "Rhiannon Falls" }),
  ]);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["plain", "mention", "plain"],
  );
  assert.equal(segments[1]!.text, "@Rhiannon Falls");
}

// No mentions or no matches: exactly one plain segment, byte-identical text.
{
  const body = "no tags here @Nobody";
  const untouched = splitBodyIntoMentionSegments(body, [mention({ label: "Someone Else" })]);
  assert.deepEqual(untouched, [{ type: "plain", text: body }]);
  assert.deepEqual(splitBodyIntoMentionSegments(body, []), [{ type: "plain", text: body }]);
}

// Longest label wins: "@Samantha Jones" must not be claimed by "@Sam".
{
  const segments = splitBodyIntoMentionSegments("ping @Samantha Jones and @Sam", [
    mention({ label: "Sam" }),
    mention({ label: "Samantha Jones" }),
  ]);
  const mentions = segments.filter((segment) => segment.type === "mention");
  assert.equal(mentions.length, 2);
  assert.equal(mentions[0]!.text, "@Samantha Jones");
  assert.equal(mentions[1]!.text, "@Sam");
}

// Word boundary: a mentioned "Sam" must not match inside an unmentioned "@Samantha".
{
  const segments = splitBodyIntoMentionSegments("cc @Samantha about it", [mention({ label: "Sam" })]);
  assert.deepEqual(segments, [{ type: "plain", text: "cc @Samantha about it" }]);
}

// Mention boundaries match the server's handle-token contract: not embedded in
// another token before "@", and not followed by handle-safe punctuation.
{
  assert.deepEqual(splitBodyIntoMentionSegments("email x@Sam about it", [mention({ label: "Sam" })]), [
    { type: "plain", text: "email x@Sam about it" },
  ]);
  assert.deepEqual(splitBodyIntoMentionSegments("cc @Sam-test about it", [mention({ label: "Sam" })]), [
    { type: "plain", text: "cc @Sam-test about it" },
  ]);
  assert.equal(textContainsMentionToken("email x@Sam about it", "@Sam"), false);
  assert.equal(textContainsMentionToken("cc @Sam-test about it", "@Sam"), false);
  assert.equal(textContainsMentionToken("cc @Sam, please", "@Sam"), true);
}

// Every occurrence chips: tagging the same person twice highlights both.
{
  const segments = splitBodyIntoMentionSegments("@Eric W then @Eric W again", [
    mention({ label: "Eric W" }),
  ]);
  assert.equal(segments.filter((segment) => segment.type === "mention").length, 2);
}

// Punctuation directly after a mention is a valid boundary.
{
  const segments = splitBodyIntoMentionSegments("thanks @Eric W!", [mention({ label: "Eric W" })]);
  assert.equal(segments.filter((segment) => segment.type === "mention").length, 1);
  assert.equal(segments.at(-1)!.text, "!");
}

// Renamed-user degradation: label no longer in text -> plain text, no crash.
{
  const segments = splitBodyIntoMentionSegments("hi @Old Name", [mention({ label: "New Name" })]);
  assert.deepEqual(segments, [{ type: "plain", text: "hi @Old Name" }]);
}

// Empty and blank-label safety.
assert.deepEqual(splitBodyIntoMentionSegments("", [mention({ label: "X" })]), []);
assert.deepEqual(splitBodyIntoMentionSegments("text", [mention({ label: "  " })]), [
  { type: "plain", text: "text" },
]);

// Agent mentions: kind community_agent, no userId — still chips by label.
{
  const segments = splitBodyIntoMentionSegments("asking @Polynet to pull it", [
    mention({ label: "Polynet", kind: "community_agent", userId: null as unknown as string }),
  ]);
  const chips = segments.filter((segment) => segment.type === "mention");
  assert.equal(chips.length, 1);
  assert.equal(chips[0]!.text, "@Polynet");
  assert.equal((chips[0] as { mention: ResolvedMentionForRendering }).mention.kind, "community_agent");
}

// Role mentions: @everybody is one visible token even though the backend fans
// it out to per-recipient user mention rows.
{
  const segments = splitBodyIntoMentionSegments("heads up @everybody", [
    mention({ label: "everybody", kind: "role", userId: null as unknown as string }),
  ]);
  const chips = segments.filter((segment) => segment.type === "mention");
  assert.equal(chips.length, 1);
  assert.equal(chips[0]!.text, "@everybody");
  assert.equal((chips[0] as { mention: ResolvedMentionForRendering }).mention.kind, "role");
}

// Typeahead click-pick: the menu must preventDefault on mousedown so the
// textarea keeps focus — otherwise its blur closes the menu before the row's
// click can land, and clicking a suggestion silently does nothing.
{
  const { readFileSync } = await import("node:fs");
  const menuSource = readFileSync(
    new URL("../apps/web/src/components/communityMentionAutocomplete.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    menuSource,
    /onMouseDown=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?\}\}/,
    "mention menu must keep textarea focus on mousedown so click-pick lands",
  );
  assert.doesNotMatch(
    menuSource,
    /suppressBlurRef/,
    "the dead suppressBlurRef guard must not return; focus retention is the real fix",
  );
  // Handles are the ground truth for user mention tokens (unique, stable);
  // display names collide and drift. The agent is not a user and keeps its
  // display-label token, disambiguated by the AGENT badge.
  assert.match(
    menuSource,
    /const kind = candidate\.kind \?\? "user";[\s\S]*?const normalizedHandle = String\(candidate\.handle \?\? ""\)[\s\S]*?if \(kind === "user" && !normalizedHandle\) return null;/,
    "picker must refuse handle-less user mentions instead of falling back to display names",
  );
  assert.match(
    menuSource,
    /const token = kind === "role"[\s\S]*?`@\$\{candidate\.roleKey \?\? "everybody"\}`[\s\S]*?kind === "community_agent"[\s\S]*?`@\$\{candidate\.displayName\}`[\s\S]*?`@\$\{normalizedHandle\}`/,
    "picker must insert @handle for users, @displayName for the community agent, and the canonical role token for @everybody",
  );
  assert.match(
    menuSource,
    /candidate\.kind === "community_agent"[\s\S]*Community agent[\s\S]*mention-autocomplete-agent-badge[\s\S]*AGENT/,
    "community-agent mention rows must explain that the candidate is the community agent and keep the AGENT badge",
  );
  assert.match(
    menuSource,
    /kind\?: "user" \| "community_agent" \| "role"[\s\S]*roleKey\?: "everybody"/,
    "mention candidates and committed mentions must carry a first-class role mention shape",
  );
  assert.match(
    menuSource,
    /kind === "role"[\s\S]*roleKey: candidate\.roleKey \?\? "everybody"[\s\S]*emailMode: candidate\.emailMode \?\? null/,
    "committed @everybody mentions must preserve the role key and email warning metadata for send serialization",
  );
}

// Handles are the ONLY chip token for user mentions (Neil's ruling,
// 2026-07-02): @handle is unique and stable; display-name text never chips —
// pre-handle messages and hand-typed names stay plain text by design.
{
  const { readFileSync } = await import("node:fs");
  const feedSource = readFileSync(
    new URL("../apps/web/src/components/communityInteractionFeed.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    feedSource,
    /const handle = context\.profilesByUserId\?\.\[userId\]\?\.handle\?\.trim\(\);[\s\S]*?if \(!handle\) continue;[\s\S]*?label: handle,/,
    "user mention chips must resolve from the handle and only the handle",
  );
  assert.doesNotMatch(
    feedSource,
    /key: `\$\{mention\.id\}:name`/,
    "the display-name chip fallback must not return — handles are the ground truth",
  );
}

// A self-mention should stay as legible as any other human mention. Attention
// belongs to the message-level edge and wash, not a filled inline name chip.
{
  const { readFileSync } = await import("node:fs");
  const styles = [
    readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8"),
    readFileSync(
      new URL("../apps/web/src/styles/community-and-content.css", import.meta.url),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(
    styles,
    /\.community-mention-chip\.is-self\s*\{/,
    "self mentions must not replace the readable human-mention treatment with a filled accent",
  );
  assert.match(
    styles,
    /\.community-interaction-message\.is-self-mentioned\s*\{[\s\S]*?border-left:\s*2px solid var\(--accent-selection\);/,
    "self-mention selection should remain on the message container",
  );
}

// Send path: committed user mentions survive only by their exact inserted
// @handle token. Display-name reconstruction must not be an active fallback.
{
  const { readFileSync } = await import("node:fs");
  const chatPanelSource = readFileSync(
    new URL("../apps/web/src/components/WebCommunityChatPanel.tsx", import.meta.url),
    "utf8",
  );
  const senderSource = readFileSync(
    new URL("../apps/web/src/controllers/useWebCommunityChatController.ts", import.meta.url),
    "utf8",
  );
  const appSource = readFileSync(
    new URL("../apps/web/src/App.tsx", import.meta.url),
    "utf8",
  );
  const projectionSource = readFileSync(
    new URL("../apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts", import.meta.url),
    "utf8",
  );
  const feedSource = readFileSync(
    new URL("../apps/web/src/components/communityInteractionFeed.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    chatPanelSource,
    /drawerReplyMentions\.filter\(\(mention\) => textContainsMentionToken\(text, mention\.token\)\)/,
    "drawer replies must preserve committed mentions by exact @handle token",
  );
  assert.doesNotMatch(
    chatPanelSource,
    /text\.includes\(`@\$\{mention\.displayName\}`\)/,
    "drawer replies must not identify mentions by display name",
  );
  assert.match(
    senderSource,
    /textContainsMentionToken\(rawText, mention\.token\)/,
    "shared sender must keep mentions by exact inserted token",
  );
  assert.doesNotMatch(
    senderSource,
    /rawText\.includes\(mention\.token\)/,
    "shared sender must not use substring checks for mention survival",
  );
  assert.doesNotMatch(
    senderSource,
    /mention\.token \|\| `@\$\{mention\.displayName\}`/,
    "shared sender must not fall back to display-name mention identity",
  );
  assert.match(
    chatPanelSource,
    /canMentionEverybody: boolean/,
    "community chat panel must receive a dedicated owner-admin @everybody capability",
  );
  assert.match(
    chatPanelSource,
    /mentionableCommunityMembers: CommunityMentionMember\[\]/,
    "community chat panel must receive an active-community directory allowlist for member mention candidates",
  );
  assert.match(
    appSource,
    /mentionableCommunityMembers: communityDirectoryMembers/,
    "App must source member mention candidates from the active community directory, not the global profile cache",
  );
  assert.match(
    projectionSource,
    /mentionableCommunityMembers: params\.mentionableCommunityMembers/,
    "community surface projection must pass the scoped mention member allowlist through to chat",
  );
  assert.match(
    chatPanelSource,
    /const seenMemberIds = new Set<string>\(\)[\s\S]*const memberCandidates = mentionableCommunityMembers[\s\S]*const userId = String\(member\.user_id \?\? ""\)\.trim\(\)[\s\S]*const profile = profilesByUserId\[userId\]/,
    "member mention candidates must be allowlisted by active community directory rows before profile hydration",
  );
  assert.doesNotMatch(
    chatPanelSource,
    /const memberCandidates = Object\.values\(profilesByUserId\)/,
    "member mention candidates must not be generated from the global cached profile map",
  );
  assert.match(
    senderSource,
    /useState<CommittedMention\[\]>\(\[\]\)/,
    "the canonical composer mention state must use the committed mention type",
  );
  assert.match(
    senderSource,
    /const resetChatState = useCallback\(\(\) => \{[\s\S]*setMessageMentions\(\[\]\);[\s\S]*useEffect\(\(\) => \{[\s\S]*resetChatState\(\);[\s\S]*params\.activeCommunityId/,
    "switching active communities must drop committed mention payloads so stale cross-community tokens become plain text",
  );
  assert.match(
    projectionSource,
    /canMentionEverybody: params\.canManageMembersActiveCommunity/,
    "@everybody UI exposure must come from the owner-admin member-management capability, not moderator content permissions",
  );
  assert.match(
    chatPanelSource,
    /const everybodyCandidate: MentionCandidate \| null = canMentionEverybody[\s\S]*userId: "role:everybody"[\s\S]*displayName: "Everybody"[\s\S]*roleKey: "everybody"/,
    "owner/admin mention candidates must include a first-class @everybody role candidate",
  );
  assert.match(
    chatPanelSource,
    /const agentCandidate: MentionCandidate \| null = agentDisplayName[\s\S]*userId: "community_agent"[\s\S]*kind: "community_agent" as const[\s\S]*const localMainMentionCandidates = useMemo<MentionCandidate\[\]>\([\s\S]*localMentionCandidateParts\.agentCandidate[\s\S]*!replyingToMessage && localMentionCandidateParts\.everybodyCandidate[\s\S]*localMentionCandidateParts\.memberCandidates/,
    "root composer mention candidates must pin the community agent before @everybody and humans",
  );
  assert.match(
    chatPanelSource,
    /const localReplyMentionCandidates = useMemo<MentionCandidate\[\]>\([\s\S]*localMentionCandidateParts\.agentCandidate[\s\S]*localMentionCandidateParts\.memberCandidates[\s\S]*const mainMentionCandidates/,
    "reply composer mention candidates must keep the community agent and humans without @everybody",
  );
  assert.match(
    senderSource,
    /mention\.kind === "role"[\s\S]*mentionsToSend\.push\(\{[\s\S]*roleKey: mention\.roleKey \?\? EVERYBODY_MENTION_ROLE_KEY/,
    "shared sender must serialize committed @everybody mentions as roleKey payloads",
  );
  assert.match(
    appSource,
    /const canMentionEverybodyRef = useRef\(false\)[\s\S]*useWebCommunityChatController\(\{[\s\S]*canMentionEverybodyRef[\s\S]*canMentionEverybodyRef\.current = canManageMembersActiveCommunity/,
    "manual @everybody detection must be gated by the same owner-admin capability as the UI candidate without stale closures",
  );
  assert.match(
    senderSource,
    /const committedEverybodyMention = mentionDraft\.find\([\s\S]*mentionTokenIsEverybody\(mention\.token\)[\s\S]*textContainsMentionToken\(rawText, mention\.token\)/,
    "manual @everybody/@everyone detection must not override a committed colliding user or agent token",
  );
  assert.match(
    senderSource,
    /current\.canMentionEverybodyRef\.current[\s\S]*!seenMentionKeys\.has\(`role:\$\{EVERYBODY_MENTION_ROLE_KEY\}`\)[\s\S]*!committedEverybodyMention[\s\S]*textContainsEverybodyMentionToken\(rawText\)[\s\S]*mentionsToSend\.push\(\{ roleKey: EVERYBODY_MENTION_ROLE_KEY \}\)/,
    "owners/admins who literally type @everybody or @everyone must send the canonical roleKey payload",
  );
  assert.match(
    senderSource,
    /Unread members may also get an email after 15 minutes[\s\S]*once every 72 hours[\s\S]*window\.confirm\(confirmation\)/,
    "@everybody sends must show the mass-email warning before the message is committed",
  );
  assert.match(
    feedSource,
    /const seenRoleKeys = new Set<string>\(\)[\s\S]*mentioned_role_key[\s\S]*roleKey === "everybody"[\s\S]*key: `role:\$\{roleKey\}`[\s\S]*kind: "role"/,
    "feed rendering must dedupe broadcast recipient rows into one visible @everybody role chip",
  );
}

// Composer highlights are presentation only: the textarea stays native for
// typing/caret/selection, while a non-interactive mirror colors committed
// mention tokens with the theme accent, except the canonical community agent
// which keeps the fixed agent purple used in feed chips and picker badges.
{
  const { readFileSync } = await import("node:fs");
  const menuSource = readFileSync(
    new URL("../apps/web/src/components/communityMentionAutocomplete.tsx", import.meta.url),
    "utf8",
  );
  const chatPanelSource = readFileSync(
    new URL("../apps/web/src/components/WebCommunityChatPanel.tsx", import.meta.url),
    "utf8",
  );
  const baseCss = [
    readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8"),
    readFileSync(
      new URL("../apps/web/src/styles/community-and-content.css", import.meta.url),
      "utf8",
    ),
  ].join("\n");
  assert.match(
    menuSource,
    /export function MentionComposerHighlight/,
    "composer mention highlighting must live with the mention autocomplete contract",
  );
  assert.match(
    menuSource,
    /splitBodyIntoMentionSegments\(props\.value, resolvedMentions\)/,
    "composer highlighting must use the same boundary-aware mention splitter as message rendering",
  );
  assert.match(
    menuSource,
    /mention-composer-highlight-token\$\{segment\.mention\.kind === "community_agent" \? " is-agent" : ""\}/,
    "composer highlight tokens must distinguish the canonical community agent from theme-accent user mentions",
  );
  assert.equal(
    (chatPanelSource.match(/className="mention-composer-field"/g) ?? []).length,
    2,
    "both main and drawer community composers must use the mention highlight field wrapper",
  );
  assert.match(
    chatPanelSource,
    /<MentionComposerHighlight[\s\S]*?value=\{communityMessageInput\}[\s\S]*?mentions=\{communityMessageMentions\}/,
    "main composer must highlight committed main-message mentions",
  );
  assert.match(
    chatPanelSource,
    /<MentionComposerHighlight[\s\S]*?value=\{drawerReplyInput\}[\s\S]*?mentions=\{drawerReplyMentions\}/,
    "drawer composer must highlight committed drawer-reply mentions",
  );
  assert.match(
    chatPanelSource,
    /onScroll=\{\(event\) => syncMentionComposerHighlightScroll\(event\.currentTarget\)\}/,
    "composer highlight mirror must stay aligned when long text scrolls",
  );
  assert.match(
    baseCss,
    /\.mention-composer-field \.chat-input \{[\s\S]*?color: transparent;[\s\S]*?caret-color: var\(--text-primary\);[\s\S]*?\}/,
    "textarea text must be visually delegated to the mirror while preserving a native caret",
  );
  assert.match(
    baseCss,
    /\.mention-composer-highlight \{[\s\S]*?pointer-events: none;[\s\S]*?white-space: pre-wrap;[\s\S]*?\}/,
    "composer highlight mirror must be inert and preserve textarea whitespace",
  );
  assert.ok(
    baseCss.includes("color: var(--accent-gold, var(--accent));"),
    "non-agent composer mention token color must use the theme accent that is pink in Polynet and white in default dark",
  );
  const highlightTokenRule = baseCss.match(/\.mention-composer-highlight-token \{(?<body>[\s\S]*?)\}/)
    ?.groups?.body ?? "";
  assert.ok(highlightTokenRule.trim(), "composer mention token highlight rule must exist");
  assert.doesNotMatch(
    highlightTokenRule,
    /(font-weight|letter-spacing|font-size|font-family|font-stretch):/,
    "composer mention token highlighting must be metric-neutral so the native textarea caret stays aligned",
  );
  const agentHighlightTokenRule =
    baseCss.match(/\.mention-composer-highlight-token\.is-agent \{(?<body>[\s\S]*?)\}/)?.groups
      ?.body ?? "";
  assert.match(
    agentHighlightTokenRule,
    /color:\s*#c4b5fd;/,
    "community agent composer mention token must use the fixed agent purple, not the theme accent",
  );
  assert.doesNotMatch(
    agentHighlightTokenRule,
    /(font-weight|letter-spacing|font-size|font-family|font-stretch):/,
    "community agent composer highlighting must stay metric-neutral so the native textarea caret stays aligned",
  );
}

console.log("community_mention_rendering_contract_proof: ok");
