import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveHorizontalRovingIndex } from "../shared/horizontalRovingNavigation.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const choiceControls = read(
  "apps/web/src/components/WebPlatformChoiceControls.tsx",
);
const communitySettings = read(
  "apps/web/src/components/WebCommunitySettingsSection.tsx",
);
const communitySettingsUiController = read(
  "apps/web/src/controllers/useWebCommunitySettingsUiController.ts",
);
const communitySettingsGovernanceController = read(
  "shared/useCommunitySettingsGovernanceController.ts",
);
const agentSettings = read(
  "apps/web/src/components/WebCommunityAiAgentSection.tsx",
);
const settingsNav = read("shared/SettingsNavList.tsx");
const settingsStyles = read(
  "apps/web/src/styles/settings-runtime-and-theme-overrides.css",
);

assert.equal(
  resolveHorizontalRovingIndex({
    key: "ArrowRight",
    currentIndex: 2,
    enabled: [true, true, true],
  }),
  0,
  "ArrowRight must wrap to the first enabled choice",
);
assert.equal(
  resolveHorizontalRovingIndex({
    key: "ArrowLeft",
    currentIndex: 0,
    enabled: [true, true, true],
  }),
  2,
  "ArrowLeft must wrap to the last enabled choice",
);
assert.equal(
  resolveHorizontalRovingIndex({
    key: "ArrowRight",
    currentIndex: 0,
    enabled: [true, false, true],
  }),
  2,
  "roving navigation must skip disabled choices",
);
assert.equal(
  resolveHorizontalRovingIndex({
    key: "Home",
    currentIndex: 2,
    enabled: [false, true, true],
  }),
  1,
  "Home must select the first enabled choice",
);
assert.equal(
  resolveHorizontalRovingIndex({
    key: "End",
    currentIndex: 0,
    enabled: [true, true, false],
  }),
  1,
  "End must select the last enabled choice",
);
assert.equal(
  resolveHorizontalRovingIndex({
    key: "ArrowDown",
    currentIndex: 0,
    enabled: [true, true],
  }),
  null,
  "horizontal widgets must preserve vertical browser behavior",
);

assert.match(choiceControls, /role="tablist"/);
assert.match(choiceControls, /role="tab"/);
assert.match(choiceControls, /aria-selected=\{isActive\}/);
assert.match(
  choiceControls,
  /aria-controls=\{platformTabPanelId\(idPrefix, tab\.id\)\}/,
);
assert.match(choiceControls, /tabIndex=\{isActive \? 0 : -1\}/);
assert.match(choiceControls, /role="radiogroup"/);
assert.match(choiceControls, /role="radio"/);
assert.match(choiceControls, /aria-checked=\{isActive\}/);
assert.doesNotMatch(
  agentSettings,
  /WebPlatformTabList|role="tabpanel"/,
  "the instructions-only Community Agent pane must not retain a nested tab interface",
);

// Community settings use a page-style side nav (one button per pane) rather
// than tabs: the selected pane is announced as the current page.
const communitySettingsNav = read("apps/web/src/components/WebCommunitySettingsNav.tsx");
assert.match(
  communitySettingsNav,
  /<nav className="pn-settings-nav" aria-label="Settings">/,
  "community settings navigation must be a labelled nav landmark",
);
assert.match(
  communitySettingsNav,
  /type="button"[\s\S]*aria-current=\{props\.activePane === item\.pane \? "page" : undefined\}[\s\S]*onClick=\{\(\) => props\.onSelectPane\(item\.pane\)\}/,
  "each pane must be a keyboard-reachable button that exposes the current page",
);
assert.doesNotMatch(communitySettingsNav, /role="tab"/, "the settings side nav must not claim tab semantics");

assert.match(
  communitySettings,
  /listCommunitySettingsPanesForAccess\(settingsPaneAccess\)/,
  "keyboard targets must remain filtered by centralized access authority",
);
assert.match(
  communitySettings,
  /htmlFor="community-settings-pricing"[\s\S]*id="community-settings-pricing"/,
  "Pricing must be one labelled native control",
);
assert.doesNotMatch(
  communitySettings,
  /role="tablist"\s*aria-label="Pricing options"/,
  "Pricing must not claim tab semantics",
);
assert.match(
  settingsNav,
  /aria-current=\{settingsGroup === item\.id \? "page" : undefined\}/,
  "global settings navigation must expose the current page",
);
assert.match(
  settingsStyles,
  /\.settings-panel \.platform-switcher-btn:focus-visible\s*\{[\s\S]*var\(--focus-ring\)/,
  "settings switchers must expose a visible theme-aware focus indicator",
);
assert.doesNotMatch(
  settingsStyles,
  /\.create-(?:banner|avatar)-btn input(?:\[type="file"\])?\s*\{\s*display:\s*none/,
  "community image uploads must remain keyboard-focusable",
);
assert.match(
  settingsStyles,
  /\.create-banner-btn:has\(input\[type="file"\]:focus-visible\)[\s\S]*var\(--focus-ring\)/,
  "community image upload labels must expose a visible focus indicator",
);
// General settings save themselves, like Substack: a short pause after a
// change, never mid-save, and never while a field is incomplete.
assert.match(
  communitySettings,
  /const canSave =\s*state\.isCommunitySettingsDirty &&\s*!state\.isSavingCommunitySettings &&\s*!state\.isProcessingCommunitySettingsBanner &&[\s\S]*!hint;/,
  "autosave must run only when there is something valid to save",
);
assert.match(
  communitySettings,
  /if \(!canSave \|\| failed\) return;[\s\S]*window\.setTimeout\([\s\S]*actions\.handleSaveCommunitySettings\(\)[\s\S]*AUTOSAVE_DELAY_MS\)/,
  "autosave must debounce and must not retry a failed save on its own",
);
assert.match(
  communitySettingsUiController,
  /handleCancelCommunitySettings[\s\S]*getSavedCommunitySettingsSnapshot\(\)[\s\S]*setDraftFromSnapshot\(saved\)[\s\S]*clearCommunitySettingsDirty\(\)/,
  "Cancel must restore the complete saved aggregate snapshot locally",
);
assert.match(
  communitySettingsGovernanceController,
  /communitySettingsSaveInFlightRef\.current\) return;[\s\S]*communitySettingsSaveInFlightRef\.current = true;[\s\S]*communitySettingsSaveInFlightRef\.current = false;/,
  "community settings saves must be single-flight even before React disables the button",
);
assert.match(
  communitySettingsUiController,
  /communitySettingsDraftRevisionRef\.current \+= 1;[\s\S]*communitySettingsLoadSequenceRef/,
  "settings drafts must carry a revision so late save completions cannot erase newer edits",
);
assert.doesNotMatch(
  communitySettings,
  /className=\{`platform-save-button\$\{[\s\S]*is-saved/,
  "the General pane must not retain a redundant disabled saved-state button",
);

console.log(
  "PASS: community settings keyboard accessibility contract is complete.",
);
