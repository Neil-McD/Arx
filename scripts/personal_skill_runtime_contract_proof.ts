import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function main() {
  const userPlatformSkills = readText(
    "convex/userPlatformSkills.ts",
  );
  const runtimeSkillResolution = readText(
    "convex/runtimeSkillResolution.ts",
  );
  const skillPackages = readText(
    "convex/skillPackages.ts",
  );
  const runtimeAgentLoop = readText(
    "convex/runtimeAgentLoop.ts",
  );
  const runtimeHarnessComposition = readText(
    "convex/runtimeHarnessComposition.ts",
  );
  const personalSkillOverlayRuntime = readText(
    "shared/personalSkillOverlayRuntime.ts",
  );
  const settingsPanels = readText(
    "apps/web/src/components/WebSettingsPanels.tsx",
  );

  for (const exportedName of [
    "export const createUserPlatformSkill = mutation({",
    "export const listUserPlatformSkills = query({",
    "export const updateUserPlatformSkillInstall = mutation({",
    "export const updateUserPlatformSkillPackage = mutation({",
    "export const deleteUserPlatformSkill = mutation({",
  ]) {
    assertIncludes(
      userPlatformSkills,
      exportedName,
      "personal skill lifecycle surface",
    );
  }

  assertIncludes(
    skillPackages,
    "skillPackageRevisions",
    "skill revision table usage",
  );
  assert.ok(
    !skillPackages.includes("export const createSkillPackage = mutation({"),
    "expected duplicate community-first package creation surface to be removed",
  );
  assert.ok(
    !skillPackages.includes("upsertUserPlatformSkillInstallInternal"),
    "expected shared skill package creation to stay decoupled from personal installs",
  );
  assertIncludes(
    runtimeSkillResolution,
    "export const resolveRuntimeSkillSelectionInternal = internalQuery({",
    "shared runtime skill resolution authority",
  );
  assertIncludes(
    userPlatformSkills,
    "internal.skillPackages.createSkillPackageInternal",
    "personal create-and-install flow owned by personal skill authority",
  );
  assertIncludes(
    runtimeHarnessComposition,
    "buildPersonalSkillOverlayRuntimeState({",
    "personal overlay runtime composition",
  );
  assertIncludes(
    personalSkillOverlayRuntime,
    "PERSONAL_WORKFLOW_CONTEXT",
    "personal workflow context prompt block",
  );
  assertIncludes(
    personalSkillOverlayRuntime,
    "Personal skill packages remain available across community lenses.",
    "personal skills stay available with a community lens",
  );
  assertIncludes(
    personalSkillOverlayRuntime,
    "prefer them; use personal skills as supporting or fallback workflows",
    "community workflows are preferred without making personal skills exclusive",
  );
  assertIncludes(
    runtimeAgentLoop,
    "composeResolvedRuntimeHarness({",
    "personal overlay runtime composer usage",
  );
  assertIncludes(
    runtimeAgentLoop,
    "personal_skills_resolved",
    "personal runtime skill evidence event",
  );
  assertIncludes(
    runtimeAgentLoop,
    "internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal",
    "shared runtime skill resolver query",
  );
  assertIncludes(
    runtimeAgentLoop,
    "ambiguous_skill_mention_tokens",
    "cross-scope ambiguity evidence",
  );
  assert.ok(
    !settingsPanels.includes("WebPersonalSkillsAccountSection") &&
      !settingsPanels.includes("Personal skills"),
    "global Account settings must not expose personal skill management",
  );

  console.log("personal_skill_runtime_contract_proof: ok");
}

main();
