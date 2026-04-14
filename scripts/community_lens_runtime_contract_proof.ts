import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const httpDaytona = readText(
    "/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts",
  );

  assertIncludes(
    httpDaytona,
    "internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal",
    "community-lens mounted app query",
  );
  assertIncludes(
    httpDaytona,
    "listRuntimeCommunitySkillInventoryInternal",
    "community-lens skill inventory query",
  );
  assertIncludes(
    httpDaytona,
    "requestedMentionTokens: Array.from(explicitCommunitySkillMentions)",
    "community-lens selected skill query",
  );
  assertIncludes(
    httpDaytona,
    "buildCommunityOverlayRuntimeState({",
    "shared overlay runtime composition helper",
  );
  assertIncludes(
    httpDaytona,
    "overlayRuntimeState.systemPromptSuffix",
    "overlay prompt suffix composition",
  );
  assertIncludes(
    httpDaytona,
    "community_app_tools_resolved",
    "runtime evidence for mounted app overlays",
  );
  assertIncludes(
    httpDaytona,
    "community_skills_resolved",
    "runtime evidence for skill overlays",
  );

  console.log("community_lens_runtime_contract_proof: ok");
}

main();
