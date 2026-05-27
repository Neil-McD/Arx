import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const funnelEditor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const governanceController = read("shared/useCommunitySettingsGovernanceController.ts");

assert.match(
  funnelEditor,
  /funnelOneLiner: string;[\s\S]*setFunnelOneLiner: \(value: string\) => void;[\s\S]*funnelAbout: string;[\s\S]*setFunnelAbout: \(value: string\) => void;/,
  "funnel editor must receive canonical community copy fields",
);
assert.match(
  funnelEditor,
  /isFunnelCopyDirty: boolean;[\s\S]*handleSaveCommunityFunnelCopy: \(\) => Promise<boolean> \| boolean;/,
  "funnel editor must know canonical copy dirtiness and save through the focused copy path",
);
assert.match(
  funnelEditor,
  /const isMediaDirty = communityFunnelDirtyRef\.current;[\s\S]*const isDirty = isMediaDirty \|\| isFunnelCopyDirty;/,
  "funnel save state must combine media dirtiness and canonical copy dirtiness",
);
assert.match(
  funnelEditor,
  /if \(isFunnelCopyDirty\) \{[\s\S]*const savedCopy = await handleSaveCommunityFunnelCopy\(\);[\s\S]*if \(savedCopy === false\) return;[\s\S]*\}[\s\S]*if \(isMediaDirty\) \{[\s\S]*const savedMedia = await handleSaveCommunityFunnel\(\);/,
  "combined funnel save must save canonical copy before media and stop if copy fails",
);
assert.match(
  funnelEditor,
  /value=\{funnelOneLiner\}[\s\S]*setFunnelOneLiner\(event\.target\.value\);[\s\S]*markCommunitySettingsDirty\(\);/,
  "funnel one-liner edits must mark canonical community settings dirty",
);
assert.match(
  funnelEditor,
  /value=\{funnelAbout\}[\s\S]*setFunnelAbout\(event\.target\.value\);[\s\S]*markCommunitySettingsDirty\(\);/,
  "funnel about edits must mark canonical community settings dirty",
);
assert.doesNotMatch(
  funnelEditor,
  /Community identity and long-form copy come from Settings/,
  "funnel editor must not tell owners to leave the Funnel tab to edit funnel copy",
);

assert.match(
  app,
  /const isCommunityFunnelCopyDirty = Boolean\(activeCommunity\) && \([\s\S]*communitySettingsOneLiner !== \(activeCommunity\?\.one_liner \?\? ""\)[\s\S]*communitySettingsAbout !== \(activeCommunity\?\.about \?\? ""\)[\s\S]*\);/,
  "App must derive funnel copy dirtiness from active community truth",
);
assert.match(
  app,
  /const handleResetCommunityFunnelCopy = useCallback\(\(\) => \{[\s\S]*setCommunitySettingsOneLiner\(activeCommunity\?\.one_liner \?\? ""\);[\s\S]*setCommunitySettingsAbout\(activeCommunity\?\.about \?\? ""\);[\s\S]*communitySettingsDirtyRef\.current = hasCommunitySettingsDirtyOutsideFunnelCopy\(\);/,
  "App must reset Funnel copy back to active community truth",
);
assert.match(
  app,
  /const handleSaveCommunityFunnelCopy = useCallback\(async \(\): Promise<boolean> => \{[\s\S]*saveCloudCommunityLaunchProfile\(\{[\s\S]*oneLiner: communitySettingsOneLiner\.trim\(\) \|\| null,[\s\S]*about: communitySettingsAbout\.trim\(\) \|\| null,/,
  "App must save Funnel copy through the focused optional launch profile mutation",
);
assert.match(
  app,
  /handleSaveCommunityFunnelCopy[\s\S]*communitySettingsDirtyRef\.current = hasCommunitySettingsDirtyOutsideFunnelCopy\(\);[\s\S]*return true;/,
  "Funnel copy save must preserve unrelated dirty settings instead of blindly clearing them",
);
assert.match(
  app,
  /funnelOneLiner: communitySettingsOneLiner,[\s\S]*setFunnelOneLiner: setCommunitySettingsOneLiner,[\s\S]*funnelAbout: communitySettingsAbout,[\s\S]*setFunnelAbout: setCommunitySettingsAbout,[\s\S]*isFunnelCopyDirty: isCommunityFunnelCopyDirty,[\s\S]*handleSaveCommunityFunnelCopy,/,
  "App must wire Funnel editor copy controls to canonical community settings state",
);
assert.doesNotMatch(
  governanceController,
  /Promise<boolean>|return false;/,
  "full community settings save must not be repurposed as Funnel copy's save result transport",
);

console.log("PASS: community Funnel editor edits canonical copy and combines copy/media saves.");
