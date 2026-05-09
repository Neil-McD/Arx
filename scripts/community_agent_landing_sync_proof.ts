import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const gateway = read("shared/cloudCommunityAgentGateway.ts");
const app = read("apps/web/src/App.tsx");
const funnelSurface = read("apps/web/src/components/CommunityFunnelSurface.tsx");
const baseCss = read("apps/web/src/base.css");

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

assert.match(
  funnelSurface,
  /const onlineFaceStrip = action\.onlineFaces\.length > 0[\s\S]*?className="public-funnel-face-strip"[\s\S]*?typeof action\.onlineCount === "number"[\s\S]*?<div className="public-funnel-action-stat">[\s\S]*?Online[\s\S]*?\{onlineFaceStrip\}/,
  "online face avatars must render inside the Online stat column",
);

assert.match(
  baseCss,
  /\.public-funnel-action-stat \.public-funnel-face-strip \{[\s\S]*?margin-top: 8px;[\s\S]*?padding-left: 0;/,
  "online face strip must be centered by the stat layout instead of floating under the stats row",
);

console.log("PASS: community agent landing sync and funnel online faces layout are canonical.");
