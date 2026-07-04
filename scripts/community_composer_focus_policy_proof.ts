import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const dmHost = read("apps/web/src/components/WebDirectMessagesHost.tsx");
const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");

assert.match(
  chatPanel,
  /const COMMUNITY_COMPOSER_FOCUS_MEDIA_QUERY = "\$?\(min-width: 901px\)"/,
  "community composer autofocus must be desktop-gated",
);
assert.match(
  chatPanel,
  /function isCommunityComposerEditableElement\(element: Element \| null\): boolean/,
  "community focus policy must explicitly detect editable targets",
);
assert.match(
  chatPanel,
  /function shouldPreserveCommunityComposerFocus\(activeElement: Element \| null, input: HTMLTextAreaElement\): boolean[\s\S]*isCommunityComposerEditableElement\(activeElement\)[\s\S]*\[role='dialog'\][\s\S]*\.chat-edit-form[\s\S]*\.community-interaction-edit/,
  "community focus policy must preserve editors, dialogs, and edit forms",
);
assert.match(
  chatPanel,
  /const focusCommunityComposerSafely = useCallback\(\([\s\S]*transferFromRefs\?: Array<MutableRefObject<HTMLTextAreaElement \| null>>;[\s\S]*input\.focus\(\{ preventScroll: true \}\);[\s\S]*input\.setSelectionRange\(end, end\);/,
  "community composer focus must use the safe focus helper with preventScroll and caret restore",
);
assert.match(
  chatPanel,
  /function isCommunityComposerTransferSource\([\s\S]*activeElement === ref\.current[\s\S]*!isCommunityComposerTransferSource\(activeElement, options\?\.transferFromRefs\)[\s\S]*shouldPreserveCommunityComposerFocus\(activeElement, input\)/,
  "community focus transitions must be able to transfer from the other known composer",
);
assert.match(
  chatPanel,
  /window\.requestAnimationFrame\(\(\) => \{[\s\S]*!options\?\.force[\s\S]*shouldPreserveCommunityComposerFocus\(activeElement, input\)[\s\S]*activeElement !== input[\s\S]*return;/,
  "community composer focus must re-check active focus inside the frame before moving the caret",
);
assert.match(
  chatPanel,
  /const lastCommunityComposerFocusTargetRef = useRef<string \| null>\(null\)/,
  "community focus policy must remember the last focused target to avoid a render-time focus loop",
);
assert.match(
  chatPanel,
  /const communityComposerFocusTargetKey = \(\(\) => \{[\s\S]*profilePanelUserId[\s\S]*return null;[\s\S]*showInteractionProjection && selectedInteractionRootId && drawerReplyTarget[\s\S]*return `thread:\$\{selectedInteractionRootId\}`;[\s\S]*return `main:\$\{activeCommunity\.id\}`;/,
  "community focus priority must be thread drawer when mounted, otherwise base chat, while profile drawer suppresses focus",
);
assert.match(
  chatPanel,
  /if \(lastCommunityComposerFocusTargetRef\.current === communityComposerFocusTargetKey\) return;[\s\S]*const isThreadTarget = communityComposerFocusTargetKey\.startsWith\("thread:"\);[\s\S]*drawerReplyInputRef[\s\S]*chatInputRef[\s\S]*focusCommunityComposerSafely\(inputRef, \{[\s\S]*maxHeightPx: 120,[\s\S]*transferFromRefs: isThreadTarget \? \[chatInputRef\] : \[drawerReplyInputRef\]/,
  "community focus must move only on main/thread target transitions",
);
assert.match(
  chatPanel,
  /onStartRootReply=\{\(message\) => \{[\s\S]*setDrawerReplyTarget\(message\);[\s\S]*focusCommunityComposerSafely\(drawerReplyInputRef, \{[\s\S]*maxHeightPx: 120,[\s\S]*transferFromRefs: \[chatInputRef\]/,
  "replying to a drawer reply must use the same safe drawer focus path",
);

assert.match(
  dmHost,
  /const DIRECT_MESSAGE_COMPOSER_FOCUS_MEDIA_QUERY = "\$?\(min-width: 901px\)"/,
  "DM composer autofocus must be desktop-gated",
);
assert.match(
  dmHost,
  /function isDirectMessageComposerEditableElement\(element: Element \| null\): boolean/,
  "DM focus policy must explicitly detect editable targets",
);
assert.match(
  dmHost,
  /function shouldPreserveDirectMessageComposerFocus\(activeElement: Element \| null, input: HTMLTextAreaElement\): boolean[\s\S]*isDirectMessageComposerEditableElement\(activeElement\)[\s\S]*\[role='dialog'\]:not\(\.community-dm-panel\)[\s\S]*\.community-dm-recipient-search/,
  "DM focus policy must preserve other dialogs and the recipient search view",
);
assert.match(
  dmHost,
  /const focusDirectMessageInput = useCallback\(\(options\?: \{ force\?: boolean \}\) => \{[\s\S]*input\.focus\(\{ preventScroll: true \}\);[\s\S]*input\.setSelectionRange\(end, end\);/,
  "DM composer focus must use preventScroll and restore the caret",
);
assert.match(
  dmHost,
  /window\.requestAnimationFrame\(\(\) => \{[\s\S]*!options\?\.force[\s\S]*shouldPreserveDirectMessageComposerFocus\(activeElement, input\)[\s\S]*activeElement !== input[\s\S]*return;/,
  "DM composer focus must re-check active focus inside the frame before moving the caret",
);
assert.match(
  dmHost,
  /const lastDirectMessageFocusConversationRef = useRef<string \| null>\(null\)/,
  "DM focus policy must remember the focused conversation to avoid a render-time focus loop",
);
assert.match(
  dmHost,
  /useEffect\(\(\) => \{[\s\S]*!isOpen \|\| !activeConversationId[\s\S]*lastDirectMessageFocusConversationRef\.current = null[\s\S]*lastDirectMessageFocusConversationRef\.current === activeConversationId[\s\S]*focusDirectMessageInput\(\{ force: true \}\);[\s\S]*\}, \[activeConversationId, focusDirectMessageInput, isOpen\]\);/,
  "DM conversation open and switch transitions must focus the DM composer",
);
assert.match(
  dmHost,
  /setDirectMessagePanel\(\(previous\) =>[\s\S]*input: "",[\s\S]*attachments: \[\],[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*focusDirectMessageInput\(\);[\s\S]*\}, 0\);/,
  "DM successful send must return focus to the DM composer",
);
assert.match(
  dmPanel,
  /ref=\{\(node\) => \{[\s\S]*if \(props\.inputRef\) props\.inputRef\.current = node;/,
  "DM conversation panel must expose the composer textarea ref to the host focus policy",
);

console.log("community_composer_focus_policy_proof: ok");
