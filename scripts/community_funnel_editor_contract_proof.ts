import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const app = read("apps/web/src/App.tsx");
const baseCss = read("apps/web/src/base.css");
const funnelEditor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const visitorSurface = read("apps/web/src/components/WebCommunityVisitorSurface.tsx");
const feed = read("apps/web/src/components/communityInteractionFeed.tsx");
const projection = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
const governanceController = read("shared/useCommunitySettingsGovernanceController.ts");
const saveFunnelAboutSlice = sliceBetween(
  app,
  "const handleSaveCommunityFunnelAbout",
  "const { communityChatPanelProps",
);
const resetFunnelAboutSlice = sliceBetween(
  app,
  "const handleResetCommunityFunnelAbout",
  "const handleSaveCommunityFunnelAbout",
);

// --- The editor previews the REAL visitor page, not a separate scaffold ---
assert.match(
  funnelEditor,
  /import \{ WebCommunityVisitorSurface \} from "\.\/WebCommunityVisitorSurface"/,
  "funnel editor must preview the live visitor surface, not a bespoke funnel scaffold",
);
assert.match(
  funnelEditor,
  /<WebCommunityVisitorSurface[\s\S]*previewMode/,
  "funnel editor must render the visitor surface in preview mode",
);
assert.doesNotMatch(
  funnelEditor,
  /CommunityFunnelSurface/,
  "funnel editor must not render the deleted guest-shell scaffold",
);

// --- Model A: VSL + About stay WYSIWYG-editable inside the previewed page ---
assert.match(
  funnelEditor,
  /gateMediaOverride=\{[\s\S]*funnel-editor-media-dropzone[\s\S]*openVideoUrlModal/,
  "the VSL must be edited by clicking the video inside the previewed gate",
);
assert.match(
  funnelEditor,
  /pinnedNoteEditor=\{renderAboutEditor\(\)\}/,
  "About must be edited inline in the pinned host note of the previewed feed",
);

// --- About inline editor internals (unchanged intent) ---
assert.match(
  funnelEditor,
  /funnelOneLiner: string;[\s\S]*funnelAbout: string;[\s\S]*setFunnelAbout: \(value: string\) => void;/,
  "funnel editor must receive the display one-liner and editable about copy",
);
assert.doesNotMatch(
  funnelEditor,
  /setFunnelOneLiner|funnel-editor-copy-fields/,
  "funnel editor must not add a separate one-liner/about copy form above the actual funnel",
);
assert.match(
  funnelEditor,
  /const isMediaDirty = communityFunnelDirtyRef\.current;[\s\S]*const isDirty = isMediaDirty \|\| isFunnelAboutDirty;/,
  "funnel save state must combine media dirtiness and inline About dirtiness",
);
assert.match(
  funnelEditor,
  /if \(isFunnelAboutDirty\) \{[\s\S]*const savedCopy = await handleSaveCommunityFunnelAbout\(\);[\s\S]*if \(savedCopy === false\) return;[\s\S]*setIsAboutEditing\(false\);[\s\S]*\}[\s\S]*if \(isMediaDirty\) \{[\s\S]*const savedMedia = await handleSaveCommunityFunnel\(\);/,
  "combined funnel save must save inline About before media and stop if About save fails",
);
assert.match(
  funnelEditor,
  /const renderAboutEditor = \(\) => \{[\s\S]*className="public-funnel-about funnel-editor-about-input"[\s\S]*setFunnelAbout\(event\.target\.value\);[\s\S]*markCommunitySettingsDirty\(\);/,
  "About edits must happen inside the rendered funnel About area and mark canonical settings dirty",
);
assert.match(
  funnelEditor,
  /const syncAboutTextareaHeight = \(\) => \{[\s\S]*textarea\.style\.height = "auto";[\s\S]*textarea\.style\.height = `\$\{textarea\.scrollHeight\}px`;/,
  "inline About editing must auto-size to content instead of collapsing into a small textbox",
);
assert.doesNotMatch(
  sliceBetween(funnelEditor, "const renderAboutEditor", "return ("),
  /\.select\(\)/,
  "inline About editing must not select all text on open",
);

// --- The inline-edit seam: a surgical, member-safe override on the feed ---
assert.match(
  projection,
  /rootBodyOverrides\?: Record<string, ReactNode> \| null;/,
  "the shared feed must accept an optional per-root body override for the editor",
);
assert.match(
  feed,
  /const bodyOverride = props\.rootBodyOverrides\?\.\[root\.id\] \?\? null;/,
  "the feed renders the override in place of a root's body when supplied",
);
assert.match(
  visitorSurface,
  /rootBodyOverrides=\{[\s\S]*previewMode && props\.pinnedNoteEditor[\s\S]*"visitor-pinned-note": props\.pinnedNoteEditor/,
  "the visitor surface only overrides the pinned-note body, and only in preview",
);

// --- App-side About save wiring (unchanged truth) ---
assert.match(
  app,
  /const isCommunityFunnelAboutDirty =[\s\S]*Boolean\(activeCommunity\) && communitySettingsAbout !== \(activeCommunity\?\.about \?\? ""\);/,
  "App must derive Funnel About dirtiness from active community truth",
);
assert.match(
  resetFunnelAboutSlice,
  /setCommunitySettingsAbout\(activeCommunity\?\.about \?\? ""\);[\s\S]*communitySettingsDirtyRef\.current = hasCommunitySettingsDirtyOutsideFunnelAbout\(\);/,
  "App must reset Funnel About back to active community truth",
);
assert.doesNotMatch(
  resetFunnelAboutSlice,
  /setCommunitySettingsOneLiner/,
  "resetting inline Funnel About must not reset unrelated one-liner edits",
);
assert.match(
  saveFunnelAboutSlice,
  /saveCloudCommunityLaunchProfile\(\{[\s\S]*input: \{[\s\S]*about: communitySettingsAbout\.trim\(\) \|\| null,/,
  "App must save inline Funnel About through the focused optional launch profile mutation",
);
assert.doesNotMatch(
  saveFunnelAboutSlice,
  /oneLiner:/,
  "inline Funnel About save must not write the one-liner",
);
assert.match(
  saveFunnelAboutSlice,
  /communitySettingsDirtyRef\.current = hasCommunitySettingsDirtyOutsideFunnelAbout\(\);[\s\S]*return true;/,
  "Funnel About save must preserve unrelated dirty settings instead of blindly clearing them",
);
assert.match(
  app,
  /funnelOneLiner: communitySettingsOneLiner,[\s\S]*funnelAbout: communitySettingsAbout,[\s\S]*setFunnelAbout: setCommunitySettingsAbout,[\s\S]*isFunnelAboutDirty: isCommunityFunnelAboutDirty,[\s\S]*handleSaveCommunityFunnelAbout,[\s\S]*handleResetCommunityFunnelAbout,/,
  "App must wire Funnel editor inline About controls to canonical community settings state",
);
assert.doesNotMatch(
  governanceController,
  /Promise<boolean>|return false;/,
  "full community settings save must not be repurposed as Funnel About's save result transport",
);

// --- CSS: the inline About resting/editing state keeps native styling ---
assert.match(
  baseCss,
  /\.settings-panel button:not\(\.funnel-editor-about-trigger\):not\(\.platform-save-button\)/,
  "generic settings button styling must not apply to the inline Funnel About resting state",
);
assert.match(
  baseCss,
  /\.funnel-editor-about-trigger,\s*[\s\S]*\.funnel-editor-about-input \{[\s\S]*background: transparent;/,
  "Funnel About resting and editing states should share native transparent styling",
);

console.log("PASS: community Funnel editor previews the live visitor surface and edits VSL + About inline.");
