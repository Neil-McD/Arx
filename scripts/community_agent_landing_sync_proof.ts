import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const gateway = read("shared/cloudCommunityAgentGateway.ts");
const app = read("apps/web/src/App.tsx");

assert.match(
  gateway,
  /Object\.prototype\.hasOwnProperty\.call\(row, "landing_json"\)[\s\S]*?return row\.landing_json \?\? null;/,
  "active community landing fetch must extract landing_json from config rows before normalizing",
);

assert.match(
  app,
  /handleSaveCommunityAgentConfigAndRefreshLanding[\s\S]*?normalizeCommunityAgentDraftForSave\(communityAgentConfigLanding\)[\s\S]*?handleSaveCommunityAgentConfig\(\)[\s\S]*?communityAgentLandingFetchSeqRef\.current \+= 1;[\s\S]*?activeCommunityAgentLandingCommunityIdRef\.current = communityIdAtSave;[\s\S]*?setActiveCommunityAgentLanding\(normalizedLanding\);/,
  "saving the AI Agent workspace editor must refresh the active empty-thread landing cache",
);

assert.match(
  app,
  /handleSaveCommunityAgentConfig: handleSaveCommunityAgentConfigAndRefreshLanding/,
  "AI Agent workspace editor must use the cache-refreshing save handler",
);

console.log("PASS: community agent landing sync is canonical.");
