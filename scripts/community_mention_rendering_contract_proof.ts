import assert from "node:assert/strict";
import {
  splitBodyIntoMentionSegments,
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
  // display names collide and drift. The agent has no handle and keeps its
  // display-name token, disambiguated by the AGENT badge.
  assert.match(
    menuSource,
    /candidate\.kind === "community_agent" \|\| !candidate\.handle[\s\S]*?`@\$\{candidate\.displayName\}`[\s\S]*?`@\$\{candidate\.handle\}`/,
    "picker must insert @handle for users and fall back to display name only for the agent or handle-less users",
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

console.log("community_mention_rendering_contract_proof: ok");
