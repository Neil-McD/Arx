import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const baseCss = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const communityAgentCss = read("apps/web/src/components/WebCommunityAgentDock.css");

assert.match(
  baseCss,
  /--composer-surface: var\(--bg-card-solid, #2a2a2a\);[\s\S]*--composer-elevation: 0 10px 28px/,
  "canonical composer material should expose an opaque surface and restrained elevation",
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
  /\.community-chat \.community-interaction-main-composer \.chat-input-bar \{[^}]*align-items: stretch;/,
  "community composer shell should stretch its stacked regions",
);
assert.match(
  baseCss,
  /\.community-chat \.community-interaction-main-composer \.chat-input-bar \{[^}]*margin: 0 14px 12px;/,
  "community composer bottom edge should align with the navigation invite control",
);
assert.match(
  baseCss,
  /\.community-chat \.community-interaction-drawer-composer \.chat-input-bar \{[^}]*align-items: stretch;/,
  "thread composer shell should stretch its stacked regions",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,[\s\S]*--community-composer-control-size: 36px;[\s\S]*--community-composer-input-size: 40px;[\s\S]*display: grid;/,
  "desktop member composers should expose their control and writing-region heights",
);
assert.match(
  baseCss,
  /\.community-member-chat \.mention-composer-field \{[^}]*min-height: var\(--community-composer-input-size\);/,
  "member composer editor should retain its dedicated writing region",
);
assert.match(
  baseCss,
  /\.app-root\.mobile-shell \.community-member-chat \.chat-input-bar \{[^}]*--community-composer-control-size: 42px;[^}]*--community-composer-input-size: 42px;/,
  "mobile member composers should retain touch controls and a bounded writing region",
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
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \{[\s\S]*position: absolute;[\s\S]*bottom: 0;[\s\S]*background: transparent;/,
  "member community composer should float over the feed",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-drawer-composer \{[\s\S]*position: absolute;[\s\S]*bottom: 0;[\s\S]*background: transparent;/,
  "the shared thread composer should retain its mobile docked fallback",
);
assert.doesNotMatch(
  baseCss,
  /community-agent-dock-launcher|community-agent-desktop-launcher-clearance/,
  "retired agent launcher must not reserve space beneath thread composers",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-feed-scroll \{[\s\S]*--mobile-community-composer-height/,
  "member feed should reserve measured main-composer clearance",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-thread-drawer \.community-interaction-drawer-scroll \{[^}]*padding-bottom: 0;/,
  "desktop thread content should not reserve a floating-composer cavity",
);
assert.match(
  baseCss,
  /\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-thread-drawer[\s\S]*\.community-interaction-drawer-composer \{[^}]*position: relative;[^}]*bottom: auto;[^}]*margin-bottom: var\(--community-thread-composer-bottom-offset, 0px\);/,
  "desktop thread composer should follow the final reply while retaining launcher clearance",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer::before,[\s\S]*\.community-member-chat \.community-interaction-drawer-composer::before \{[\s\S]*z-index: -1;[\s\S]*height: calc\(100% \+ 18px\);[\s\S]*linear-gradient\([\s\S]*var\(--bg-workspace\) 92%[\s\S]*18px,[\s\S]*var\(--bg-workspace\) 94%/,
  "community and thread content should leave only a narrow cue before becoming opaque behind the composer",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,[\s\S]*background: var\(--composer-surface\);[\s\S]*border-color: var\(--composer-border\);/,
  "community and thread composers should share the opaque material",
);
const desktopMemberComposerMaterialRule = baseCss.match(
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar,\s*\.community-member-chat \.community-interaction-drawer-composer \.chat-input-bar \{[^}]*\}/,
)?.[0] ?? "";
assert.match(
  desktopMemberComposerMaterialRule,
  /box-shadow:\s*var\(--composer-elevation\);/,
  "persistent community and thread composers should use the restrained elevation token",
);
assert.match(
  baseCss,
  /\.community-member-chat \.community-interaction-main-composer \.chat-input-bar \{[^}]*border-radius: 18px;[\s\S]*\.community-member-chat \.community-interaction-drawer-composer \.chat-input-bar \{[^}]*border-radius: 18px;/,
  "main and thread community composers should share the same raised-shell shape",
);
assert.match(
  baseCss,
  /\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-main-composer[\s\S]*\.chat-input-bar,[\s\S]*\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-drawer-composer[\s\S]*\.chat-input-bar \{[^}]*border-radius: 14px;[^}]*background: color-mix\([\s\S]*var\(--bg-workspace\) 60%,[\s\S]*var\(--bg-card-solid, var\(--bg-card\)\) 40%[\s\S]*box-shadow: none;/,
  "desktop community composers should use a bounded, shadowless material between the workspace and card surfaces",
);
assert.match(
  baseCss,
  /\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-main-composer[\s\S]*\.chat-input-bar:not\(\.drag-over\),[\s\S]*\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-drawer-composer[\s\S]*\.chat-input-bar:not\(\.drag-over\) \{[^}]*border-color: color-mix\(in srgb, var\(--border-default\) 68%, transparent\);/,
  "desktop community composers should keep a quiet resting edge without masking drag-over feedback",
);
assert.match(
  baseCss,
  /:root\[data-theme="light"\][\s\S]*\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-main-composer[\s\S]*\.chat-input-bar:not\(\.drag-over\),[\s\S]*:root\[data-theme="light"\][\s\S]*\.app-root:not\(\.mobile-shell\)[\s\S]*\.community-interaction-drawer-composer[\s\S]*\.chat-input-bar:not\(\.drag-over\) \{[^}]*border-color: var\(--stroke-panel-edge\);/,
  "light desktop community composers should use the canonical structural edge without changing drag-over feedback",
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
  /followLatestAfterComposerResize[\s\S]*new ResizeObserver\(followLatestAfterComposerResize\)[\s\S]*observer\.observe\(composer\)/,
  "thread composer growth should keep an actively followed long thread settled",
);
assert.match(
  projection,
  /props\.floatingComposers && isNearBottomRef\.current[\s\S]*scroll\.scrollTop = scroll\.scrollHeight/,
  "main composer growth should preserve follow-latest only for member floating mode",
);
assert.match(
  projection,
  /shouldFollowReplies = scroll && repliesLoadedOnce\.current[\s\S]*scroll\.scrollHeight <= scroll\.clientHeight[\s\S]*scroll\.scrollTop > 0[\s\S]*nextScroll\.scrollTop = nextScroll\.scrollHeight/,
  "thread composer growth should preserve follow-latest without pulling a newly opened short thread away from its root",
);

assert.doesNotMatch(
  communityAgentCss,
  /\.community-agent-dock textarea:focus-visible[\s\S]{0,100}var\(--community-agent-accent\)/,
  "member-agent textarea must not receive a purple focus outline",
);
assert.match(
  communityAgentCss,
  /\.community-agent-dock textarea:focus-visible \{[\s\S]*outline: none;/,
  "member-agent textarea should defer focus treatment to its shell",
);
assert.match(
  communityAgentCss,
  /\.community-agent-composer\.chat-input-bar \{ margin: 0; \}/,
  "member-agent composer only owns placement; the channel composer owns its material and shape",
);
assert.doesNotMatch(
  communityAgentCss,
  /\.community-agent-dock-composer:focus-within/,
  "member-agent composer shell should remain visually stable while focused",
);

console.log("composer_unification_contract_proof: ok");
