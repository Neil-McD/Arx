import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const panel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const controls = read("apps/web/src/components/CommunityComposerControls.tsx");
const editing = read("apps/web/src/controllers/communityComposerTextEditing.ts");
const css = read("apps/web/src/styles/community-and-content.css");
const contract = read("docs/community-interaction-substrate-contract-v1.md");

assert.match(
  panel,
  /mainMention\.handleKeyDown\(event\)[\s\S]*handleMentionTokenBackspace[\s\S]*handleCommunityComposerAuthoringKeyDown\(event, handleMainCommunityComposerUserInput\)[\s\S]*event\.key === "Enter" && !event\.shiftKey/,
  "mention selection must retain keyboard priority before formatting and send",
);
assert.match(
  panel,
  /event\.key === "Tab"[\s\S]*indentCommunityComposerList[\s\S]*event\.key === "Enter" && event\.shiftKey[\s\S]*continueCommunityComposerList/,
  "composer keyboard handling should route list indentation and continuation through pure transforms",
);
assert.match(
  panel,
  /onAttach=\{\(\) => fileInputRef\.current\?\.click\(\)\}[\s\S]*onMention=\{mainMention\.begin\}[\s\S]*onEmoji=\{insertMainComposerEmoji\}/,
  "main composer add, mention, and emoji actions should preserve existing attachment and mention ownership",
);
assert.equal(
  (panel.match(/<CommunityComposerControls/g) ?? []).length,
  2,
  "main and reply composers should render the same control component exactly once each",
);
assert.match(
  panel,
  /contextKey=\{`main:\$\{activeCommunity\?\.id \?\? "none"\}:\$\{activeCommunityChannelSlug \|\| "general"\}`\}/,
  "main composer transient controls should reset across community and channel contexts",
);
// The "+" lives in the add menu (file, poll, form); it keeps the same icon.
assert.match(
  controls,
  /<ComposerAddMenu[\s\S]*<AtSign size=\{17\} strokeWidth=\{1\.8\}[\s\S]*<Smile size=\{17\} strokeWidth=\{1\.8\}/,
  "visible insertion actions should use one icon family, size, and stroke weight",
);
assert.doesNotMatch(
  read("apps/web/src/components/CommunityPostCard.tsx").match(/export function ComposerAddMenu[\s\S]*?\n\}/)?.[0] ?? "",
  /<Plus (?!size=\{17\} strokeWidth=\{1\.8\})/,
  "the add menu's + must match the other insertion icons",
);
assert.match(
  controls,
  /useEffect\(\(\) => \{[\s\S]*setEmojiOpen\(false\);[\s\S]*\}, \[props\.contextKey\]\)/,
  "transient composer tools should reset on context changes",
);
assert.doesNotMatch(
  controls,
  /Formatting options|community-composer-format|FORMATTING_ACTIONS|onFormat/,
  "the compact composer should not expose visible formatting chrome",
);
assert.match(
  css,
  /\.community-composer-tools \{[^}]*gap: 0;/,
  "visible insertion actions should share one tight hit-area row",
);
assert.match(editing, /const MAX_LIST_INDENT = 4;/, "list authoring should cap indentation at two two-space levels");
assert.doesNotMatch(
  editing,
  /insertCommunityComposerLink|toggleCommunityComposerLineFormat|"strike"|"code"/,
  "removed formatting controls must not leave unreachable authoring actions behind",
);
assert.match(
  css,
  /\.community-composer-emoji-popover \{[^}]*bottom: calc\(100% \+ 8px\);/,
  "composer emoji choices should open upward above the bottom composer",
);
assert.match(
  contract,
  /Enter sends, Shift\+Enter inserts a newline and continues an active list marker, and Tab or Shift\+Tab changes indentation only while the selection contains a list item/,
  "the product contract should record authoring keyboard semantics",
);
assert.equal(
  (panel.match(/<textarea/g) ?? []).length,
  2,
  "main and reply community composers should retain their native textareas",
);

console.log("community_composer_authoring_contract_proof: ok");
