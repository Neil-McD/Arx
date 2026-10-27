import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCommunityComposerMentionInsertion } from "../apps/web/src/controllers/communityComposerMentionInsertion.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const composerControls = read("apps/web/src/components/CommunityComposerControls.tsx");
const mentionAutocomplete = read(
  "apps/web/src/components/communityMentionAutocomplete.tsx",
);
const communityCss = read("apps/web/src/styles/community-and-content.css");
const mobileCss = read(
  "apps/web/src/styles/settings-runtime-and-theme-overrides.css",
);
const packageJson = read("package.json");

assert.deepEqual(buildCommunityComposerMentionInsertion("", 0, 0), {
  value: "@",
  atIndex: 0,
  caret: 1,
});
assert.deepEqual(buildCommunityComposerMentionInsertion("Hello", 5, 5), {
  value: "Hello @",
  atIndex: 6,
  caret: 7,
});
assert.deepEqual(buildCommunityComposerMentionInsertion("Hello world", 5, 5), {
  value: "Hello @ world",
  atIndex: 6,
  caret: 7,
});
assert.deepEqual(buildCommunityComposerMentionInsertion("Hi old there", 3, 6), {
  value: "Hi @ there",
  atIndex: 3,
  caret: 4,
});

assert.match(
  mentionAutocomplete,
  /begin: \(\) => void;[\s\S]*const begin = useCallback\(\(\) => \{[\s\S]*buildCommunityComposerMentionInsertion[\s\S]*setActive\(\{ atIndex: insertion\.atIndex, query: "" \}\)[\s\S]*node\.focus\(\)[\s\S]*node\.setSelectionRange\(insertion\.caret, insertion\.caret\)/,
  "mention controls should insert at the saved selection, open the picker, and return focus",
);
assert.match(
  chatPanel,
  /className="community-composer-editor-row"[\s\S]*<CommunityComposerControls/,
  "community composers should render an editor above a dedicated tool row",
);
assert.match(
  composerControls,
  /onClick=\{props\.onMention\}[\s\S]*aria-label=\{props\.mentionLabel\}[\s\S]*aria-haspopup="listbox"[\s\S]*aria-expanded=\{props\.mentionMenuOpen\}/,
  "main composer should expose a functional accessible mention control",
);
assert.match(
  chatPanel,
  /mentionLabel="Mention someone in reply"[\s\S]*mentionMenuOpen=\{drawerMention\.isOpen\}/,
  "thread composer should expose the same mention affordance",
);
assert.match(
  composerControls,
  /community-composer-add[\s\S]*<Plus[\s\S]*ask-mention[\s\S]*<AtSign[\s\S]*community-composer-emoji[\s\S]*<Smile[\s\S]*community-composer-submit-tools[\s\S]*props\.voiceControl[\s\S]*props\.sendControl/,
  "shared composer row should order add, mention, emoji, voice, and send actions",
);
assert.doesNotMatch(
  composerControls,
  /Formatting options|community-composer-format-toggle/,
  "shared composer row should omit formatting chrome",
);
assert.match(
  chatPanel,
  /chat-input-bar community-interaction-reply-input-bar[\s\S]*onAttach=\{\(\) => drawerReplyFileInputRef\.current\?\.click\(\)\}[\s\S]*<VoiceInputButton[\s\S]*aria-label="Send reply"/,
  "thread composer tool row should retain attachment, dictation, and send actions",
);
assert.match(
  chatPanel,
  /<div className="chat-input-bar">[\s\S]*replyingToMessage[\s\S]*renderCommunityAttachmentsPreview\(communityAttachments,[\s\S]*community-composer-editor-row[\s\S]*<CommunityComposerControls/,
  "reply context and queued attachments should live inside the main composer shell",
);
assert.match(
  communityCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,[\s\S]*display: grid;[\s\S]*box-shadow: var\(--composer-elevation\);[\s\S]*\.community-composer-editor-row[\s\S]*\.community-composer-toolbar/,
  "member composers should use the raised two-zone layout",
);
assert.match(
  communityCss,
  /\.community-composer-toolbar \.ask-icon-btn:focus-visible,[\s\S]*\.community-composer-toolbar \.chat-send:focus-visible \{[^}]*outline: 2px solid var\(--composer-focus-ring\);[^}]*outline-offset: 2px;/,
  "composer utility controls should expose a visible keyboard focus treatment",
);
assert.match(
  mobileCss,
  /\.app-root\.mobile-shell \.community-member-chat \.chat-input-bar \{[^}]*--community-composer-control-size: 42px;[^}]*--community-composer-input-size: 42px;[^}]*border-radius: 22px;[\s\S]*\.community-composer-authoring-row \{[^}]*grid-template-columns: var\(--community-composer-control-size\) minmax\(0, 1fr\) auto;[\s\S]*\.ask-mention,[\s\S]*\.community-composer-emoji-picker \{[^}]*display: none;/,
  "mobile composers should collapse to one row while omitting redundant mention and emoji buttons",
);
assert.match(
  mobileCss,
  /\.community-composer-editor-row \.chat-input,[\s\S]*\.mention-composer-highlight \{[^}]*box-sizing: border-box;[^}]*min-height: var\(--community-composer-input-size\);[^}]*line-height: 1\.45;[^}]*padding-block: calc\(\(var\(--community-composer-input-size\) - 1\.45em\) \/ 2\);/,
  "mobile composer text should share the controls' vertical centerline while retaining multiline growth",
);
assert.match(
  packageJson,
  /"check:community-composer-shell-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_composer_shell_contract_proof\.ts"/,
  "package scripts should expose the composer-shell contract proof",
);

console.log("community_composer_shell_contract_proof: ok");
