import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const baseCss = read("apps/web/src/base.css");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const visitorSurface = read("apps/web/src/components/WebCommunityVisitorSurface.tsx");
const memberAgentCss = read("apps/web/src/components/WebMemberAgentDock.css");

assert.match(
  baseCss,
  /--composer-surface: var\(--bg-card-solid, #17171a\);[\s\S]*--composer-radius: 24px;/,
  "canonical composer material should be opaque and pill-shaped",
);
assert.match(
  baseCss,
  /\.community-dm-panel-composer \{[\s\S]*background: var\(--composer-surface\);/,
  "DMs should preserve their canonical composer surface",
);
assert.match(
  baseCss,
  /\.community-dm-panel-composer \{[^}]*align-items: flex-end;/,
  "DM composer controls should remain bottom-aligned as the input grows",
);
assert.match(
  baseCss,
  /\.community-chat \.community-interaction-main-composer \.chat-input-bar \{[^}]*align-items: flex-end;/,
  "community composer controls should remain bottom-aligned as the input grows",
);
assert.match(
  baseCss,
  /\.community-chat \.community-interaction-drawer-composer \.chat-input-bar \{[^}]*align-items: flex-end;/,
  "thread composer controls should remain bottom-aligned as the input grows",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,[\s\S]*--community-composer-control-size: 36px;[\s\S]*--community-composer-input-size: 24px;/,
  "desktop member composers should expose their control and one-line input heights",
);
assert.match(
  baseCss,
  /\.community-member-chat \.mention-composer-field \{[^}]*padding-bottom: calc\([\s\S]*var\(--community-composer-control-size\) - var\(--community-composer-input-size\)[\s\S]*\/ 2[\s\S]*\);/,
  "member composer text should be optically centered while retaining its natural one-line height",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-member-chat \.chat-input-bar \{[^}]*--community-composer-control-size: 42px;[^}]*--community-composer-input-size: 28px;/,
  "mobile member composers should center text against their larger controls",
);
assert.match(
  chatPanel,
  /className=\{`community-chat community-member-chat community-attachment-drop-surface/,
  "member chat should expose an explicit styling boundary",
);
assert.match(
  chatPanel,
  /<WebCommunityInteractionProjection[\s\S]*floatingComposers/,
  "member chat should opt into the floating composer structure",
);
assert.doesNotMatch(
  visitorSurface,
  /community-member-chat|floatingComposers/,
  "the visitor funnel must not opt into member composer behavior",
);
assert.match(
  visitorSurface,
  /className="community-chat cvs-chat"/,
  "the visitor funnel should retain its existing root boundary",
);

assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \{[\s\S]*position: absolute;[\s\S]*bottom: 0;[\s\S]*background: transparent;/,
  "member community composer should float over the feed",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-drawer-composer \{[\s\S]*position: absolute;[\s\S]*bottom: 0;[\s\S]*background: transparent;/,
  "member thread composer should float over replies",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-feed-scroll \{[\s\S]*--mobile-community-composer-height/,
  "member feed should reserve measured main-composer clearance",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-thread-drawer \.community-interaction-drawer-scroll \{[\s\S]*--community-thread-composer-height/,
  "thread feed should reserve measured reply-composer clearance",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer::before,[\s\S]*\.community-member-chat \.community-interaction-drawer-composer::before \{[\s\S]*z-index: -1;[\s\S]*height: calc\(100% \+ 22px\);[\s\S]*linear-gradient\([\s\S]*var\(--bg-workspace\) 76%/,
  "community and thread content should fade behind a static composer layer",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,[\s\S]*background: var\(--composer-surface\);[\s\S]*border-color: var\(--composer-border\);/,
  "community and thread composers should share the opaque material",
);
assert.doesNotMatch(
  baseCss,
  /(?:\.community-member-chat \.chat-input-bar|\.community-dm-panel-composer):focus-within/,
  "member communication composer shells should not change when focused",
);
assert.match(
  baseCss,
  /\.community-dm-composer-float::before \{[\s\S]*z-index: -1;[\s\S]*height: calc\(100% \+ 32px\);[\s\S]*linear-gradient\([\s\S]*var\(--web-context-panel-surface\) 100%/,
  "DM content should fade into the context-panel surface behind a static composer layer",
);

assert.match(
  projection,
  /floatingComposers\?: boolean;/,
  "the shared projection should make floating structure opt-in",
);
assert.match(
  projection,
  /const drawerComposerRef = useRef<HTMLDivElement \| null>\(null\);/,
  "thread replies should own a measurable composer layer",
);
assert.match(
  projection,
  /--community-thread-composer-height[\s\S]*new ResizeObserver\(syncComposerHeight\)[\s\S]*observer\.observe\(composer\)/,
  "thread clearance should follow multiline and attachment growth",
);
assert.match(
  projection,
  /props\.floatingComposers && isNearBottomRef\.current[\s\S]*scroll\.scrollTop = scroll\.scrollHeight/,
  "main composer growth should preserve follow-latest only for member floating mode",
);
assert.match(
  projection,
  /shouldFollowReplies[\s\S]*nextScroll\.scrollTop = nextScroll\.scrollHeight/,
  "thread composer growth should preserve follow-latest behavior",
);

assert.doesNotMatch(
  memberAgentCss,
  /\.member-agent-dock textarea:focus-visible[\s\S]{0,100}var\(--member-agent-accent\)/,
  "member-agent textarea must not receive a purple focus outline",
);
assert.match(
  memberAgentCss,
  /\.member-agent-dock textarea:focus-visible \{[\s\S]*outline: none;/,
  "member-agent textarea should defer focus treatment to its shell",
);
assert.match(
  memberAgentCss,
  /\.member-agent-dock-composer \{[\s\S]*background: var\(--composer-surface,[\s\S]*border-radius: var\(--composer-radius/,
  "member-agent composer should share the canonical material and shape",
);
assert.match(
  memberAgentCss,
  /\.member-agent-dock-composer:focus-within \{[^}]*background: color-mix\(/,
  "member-agent composer may use a subtle surface shift to communicate focus",
);
assert.doesNotMatch(
  memberAgentCss,
  /\.member-agent-dock-composer:focus-within \{[^}]*(?:outline|border(?:-color)?):/,
  "member-agent composer focus must never introduce an outline or ring",
);

console.log("composer_unification_contract_proof: ok");
