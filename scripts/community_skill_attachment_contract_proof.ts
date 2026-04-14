import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const communitySkillAttachments = readText(
    "/Users/neilmcdevitt/code/arx/convex/communitySkillAttachments.ts",
  );
  const httpDaytona = readText(
    "/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts",
  );
  const skillsEditor = readText(
    "/Users/neilmcdevitt/code/arx/apps/web/src/components/WebCommunityAiAgentSkillsEditor.tsx",
  );

  for (const exportedName of [
    "export const listCommunitySkillAttachments = query({",
    "export const attachSkillPackageToCommunity = mutation({",
    "export const updateCommunitySkillAttachment = mutation({",
    "export const detachCommunitySkill = mutation({",
    "export const listRuntimeCommunitySkillInventoryInternal = internalQuery({",
    "export const listRuntimeSelectedCommunitySkillsInternal = internalQuery({",
  ]) {
    assertIncludes(
      communitySkillAttachments,
      exportedName,
      "community skill lifecycle surface",
    );
  }

  assertIncludes(
    communitySkillAttachments,
    "community_skill_attachment_missing_dependency",
    "community attachment read-model dependency guard",
  );
  assertIncludes(
    httpDaytona,
    "listRuntimeSelectedCommunitySkillsInternal",
    "selected community skills runtime query",
  );
  assertIncludes(
    httpDaytona,
    "community_skills_resolved",
    "runtime skill evidence event",
  );
  assertIncludes(
    httpDaytona,
    "buildCommunityOverlayRuntimeState({",
    "shared overlay runtime composition for selected skill injection",
  );
  assertIncludes(
    httpDaytona,
    "overlayRuntimeState.systemPromptSuffix",
    "selected skill injection prompt suffix wiring",
  );
  assert.ok(
    !communitySkillAttachments.includes("dependency_status"),
    "expected skill dependency status wiring to be removed",
  );
  assert.ok(
    !communitySkillAttachments.includes("dependencyAppSlugs"),
    "expected skill app dependency wiring to be removed",
  );
  assertIncludes(
    skillsEditor,
    "Attached skills are injected only when explicitly mentioned",
    "skills editor explicit mention guidance",
  );
  assertIncludes(
    skillsEditor,
    "Available skill packages",
    "skills editor package library section",
  );
  assertIncludes(
    skillsEditor,
    "Attach",
    "skills editor package attach action",
  );
  assert.ok(
    !skillsEditor.includes("explicitly mentioned by\n              slug"),
    "expected skills editor slug guidance to be removed",
  );
  assertIncludes(
    communitySkillAttachments,
    "requestedMentionTokens",
    "runtime selected skills mention token query args",
  );
  assertIncludes(
    communitySkillAttachments,
    "community_skill_mention_token_conflict",
    "community mention token collision guard",
  );

  console.log("community_skill_attachment_contract_proof: ok");
}

main();
