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
    /candidate\.kind !== "community_agent" && !candidate\.handle[\s\S]*?close\(\);[\s\S]*?return;/,
    "picker must refuse handle-less user mentions instead of falling back to display names",
  );
  assert.match(
    menuSource,
    /const token = candidate\.kind === "community_agent" \? `@\$\{candidate\.displayName\}` : `@\$\{candidate\.handle\}`;/,
    "picker must insert @handle for users and reserve display-label tokens for the community agent",
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

// Send path: committed user mentions survive only by their exact inserted
// @handle token. Display-name reconstruction must not be an active fallback.
{
  const { readFileSync } = await import("node:fs");
  const chatPanelSource = readFileSync(
    new URL("../apps/web/src/components/WebCommunityChatPanel.tsx", import.meta.url),
    "utf8",
  );
  const senderSource = readFileSync(
    new URL("../shared/useCommunityChatMutationController.ts", import.meta.url),
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
    /textContainsMentionToken\(bodyToSend, mention\.token\)/,
    "shared sender must keep mentions by exact inserted token",
  );
  assert.doesNotMatch(
    senderSource,
    /bodyToSend\.includes\(mention\.token\)/,
    "shared sender must not use substring checks for mention survival",
  );
  assert.doesNotMatch(
    senderSource,
    /mention\.token \|\| `@\$\{mention\.displayName\}`/,
    "shared sender must not fall back to display-name mention identity",
  );
}

// Composer highlights are presentation only: the textarea stays native for
// typing/caret/selection, while a non-interactive mirror colors committed
// mention tokens with the theme accent.
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
  const baseCss = readFileSync(new URL("../apps/web/src/base.css", import.meta.url), "utf8");
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
    "composer mention token color must use the theme accent that is pink in Polynet and white in default dark",
  );
  const highlightTokenRule = baseCss.match(/\.mention-composer-highlight-token \{(?<body>[\s\S]*?)\}/)
    ?.groups?.body ?? "";
  assert.ok(highlightTokenRule.trim(), "composer mention token highlight rule must exist");
  assert.doesNotMatch(
    highlightTokenRule,
    /(font-weight|letter-spacing|font-size|font-family|font-stretch):/,
    "composer mention token highlighting must be metric-neutral so the native textarea caret stays aligned",
  );
}

console.log("community_mention_rendering_contract_proof: ok");
