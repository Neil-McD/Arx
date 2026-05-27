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
const funnelEditor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const funnelSurface = read("apps/web/src/components/CommunityFunnelSurface.tsx");
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
  /isFunnelAboutDirty: boolean;[\s\S]*handleSaveCommunityFunnelAbout: \(\) => Promise<boolean> \| boolean;/,
  "funnel editor must track only inline About dirtiness through the focused save path",
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
assert.match(
  funnelEditor,
  /aboutContent=\{renderAboutEditor\(\)\}/,
  "funnel editor must inject inline About editing into the actual funnel surface",
);
assert.match(
  funnelSurface,
  /aboutContent\?: ReactNode;[\s\S]*aboutContent,?[\s\S]*\{aboutContent \?\? \(aboutText \?/,
  "shared funnel surface must allow editor-only About content without changing public rendering",
);

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

console.log("PASS: community Funnel editor edits About inline inside the actual funnel preview.");
