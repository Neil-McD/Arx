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
    "/Users/neilmcdevitt/code/arx/convex/userPlatformSkills.ts",
  );
  const runtimeSkillResolution = readText(
    "/Users/neilmcdevitt/code/arx/convex/runtimeSkillResolution.ts",
  );
  const skillPackages = readText(
    "/Users/neilmcdevitt/code/arx/convex/skillPackages.ts",
  );
  const httpDaytona = readText(
    "/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts",
  );
  const settingsSection = readText(
    "/Users/neilmcdevitt/code/arx/apps/web/src/components/WebIntegrationsSettingsSection.tsx",
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
    httpDaytona,
    "buildPersonalSkillOverlayRuntimeState({",
    "personal overlay runtime composition",
  );
  assertIncludes(
    httpDaytona,
    "personal_skills_resolved",
    "personal runtime skill evidence event",
  );
  assertIncludes(
    httpDaytona,
    "internal.runtimeSkillResolution.resolveRuntimeSkillSelectionInternal",
    "shared runtime skill resolver query",
  );
  assertIncludes(
    httpDaytona,
    "ambiguous_skill_mention_tokens",
    "cross-scope ambiguity evidence",
  );
  assertIncludes(
    settingsSection,
    "Create personal skill package",
    "settings personal skill create form",
  );
  assertIncludes(
    settingsSection,
    "Editing this skill updates the canonical package",
    "settings personal skill edit form",
  );
  assertIncludes(
    settingsSection,
    "Personal skills are applied only when you explicitly mention",
    "settings explicit invocation guidance",
  );

  console.log("personal_skill_runtime_contract_proof: ok");
}

main();
