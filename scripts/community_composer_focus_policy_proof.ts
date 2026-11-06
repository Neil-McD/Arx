import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");

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


console.log("community_composer_focus_policy_proof: ok");
