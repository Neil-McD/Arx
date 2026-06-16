import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function assertIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `expected ${label} to include ${needle}`);
}

function assertNotIncludes(haystack: string, needle: string, label: string) {
  assert.ok(!haystack.includes(needle), `expected ${label} not to include ${needle}`);
}

function assertOrdered(haystack: string, needles: string[], label: string) {
  let previousIndex = -1;
  for (const needle of needles) {
    const index = haystack.indexOf(needle);
    assert.ok(index >= 0, `expected ${label} to include ${needle}`);
    assert.ok(
      index > previousIndex,
      `expected ${needle} to appear after the previous marker in ${label}`,
    );
    previousIndex = index;
  }
}

function extractApplyAction(source: string): string {
  const start = source.indexOf("export const applyPrivateCommunityPluginManifest = action({");
  const end = source.indexOf("export const refreshCommunityApp = action({", start);
  assert.ok(start >= 0, "apply action must exist");
  assert.ok(end > start, "apply action must be before refreshCommunityApp");
  return source.slice(start, end);
}

function extractApplyHelper(source: string): string {
  const start = source.indexOf("async function applyPrivateCommunityPluginManifestForManager(");
  const end = source.indexOf("export const listPrivateCommunityMcpOptions = query({", start);
  assert.ok(start >= 0, "private manifest apply helper must exist");
  assert.ok(end > start, "private manifest apply helper must be before typed private MCP query");
  return source.slice(start, end);
}

function extractImportedConnectAction(source: string): string {
  const start = source.indexOf("export const connectImportedCommunityMcpAppInternal = internalAction({");
  const end = source.indexOf("async function applyPrivateCommunityPluginManifestForManager(", start);
  assert.ok(start >= 0, "imported MCP connect action must exist");
  assert.ok(end > start, "imported MCP connect action must be before apply helper");
  return source.slice(start, end);
}

function main() {
  const communityAppMounts = readText("convex/communityAppMounts.ts");
  const community = readText("convex/community.ts");
  const contract = readText("docs/private-community-plugin-manifest-contract-v1.md");
  const packageJson = readText("package.json");
  const applyAction = extractApplyAction(communityAppMounts);
  const applyHelper = extractApplyHelper(communityAppMounts);
  const importedConnectAction = extractImportedConnectAction(communityAppMounts);

  assertIncludes(
    communityAppMounts,
    "compilePrivateCommunityPluginManifest",
    "community app mounts private manifest compiler import",
  );
  assertIncludes(
    applyAction,
    "manifest: v.any()",
    "private manifest apply action accepts raw JSON-like manifest",
  );
  assertIncludes(
    applyAction,
    "internal.communityAppMounts.assertCommunityManagerAccessInternal",
    "private manifest apply action is manager gated",
  );
  assertIncludes(
    applyAction,
    "applyPrivateCommunityPluginManifestForManager({",
    "private manifest apply action delegates to the shared apply helper",
  );
  assertOrdered(
    applyHelper,
    [
      "const plan = compilePrivateCommunityPluginManifest(args.manifest);",
      "if (plan.rejections.length > 0)",
      "internal.communityAppMounts.findExistingCommunityAppMountByIdentityInternal",
      "internal.communityAppMounts.stageCommunityMcpAppForSetupInternal",
    ],
    "private manifest apply action reject-before-write and reuse-before-stage flow",
  );
  assertOrdered(
    applyHelper,
    [
      "internal.communityAppMounts.findExistingCommunityAppMountByIdentityInternal",
      "const mount = await mountDeveloperAppForCommunity({",
      "developerAppId: existingMount.app._id",
      "toolSnapshotId: existingMount.mount.toolSnapshotId",
      "enabledTools: existingMount.mount.enabledTools",
      "status: \"reused\"",
      "const setupStatus = derivePrivateCommunityPluginMcpSetupStatus(appPlan);",
    ],
    "private manifest apply action reconciles existing mounts through the mount and seeding helper",
  );
  assertNotIncludes(
    applyHelper,
    "communityAppMountId: existingMount.mount._id",
    "private manifest apply action must not merely read existing rows as reused",
  );
  assertIncludes(
    applyHelper,
    "internal.communityAppMounts.connectImportedCommunityMcpAppInternal",
    "private manifest apply action connects hosted no-auth MCP entries through existing imported path",
  );
  assertIncludes(
    applyHelper,
    "catalogAppId: appPlan.catalogAppId ?? undefined",
    "private manifest apply action preserves catalog identity for imported MCP connect",
  );
  assertIncludes(
    importedConnectAction,
    "catalogAppId: v.optional(v.string())",
    "imported MCP connect action accepts optional catalog identity",
  );
  assertIncludes(
    importedConnectAction,
    "catalogAppId: args.catalogAppId",
    "imported MCP connect action persists optional catalog identity",
  );
  assertIncludes(
    applyHelper,
    "private_plugin_skills_ignored",
    "private manifest apply action is MCP-only for this slice",
  );
  assertNotIncludes(
    applyHelper,
    "attachSkillPackageToCommunity",
    "private manifest apply action must not write skill attachments in MCP-only slice",
  );
  assertNotIncludes(
    applyHelper,
    "createDeveloperAppInternal",
    "private manifest apply action must not create a parallel developer app path",
  );
  assertNotIncludes(
    applyHelper,
    "userPlatformAppMounts.mountValidatedDeveloperAppForUser",
    "private manifest apply action must not bypass community bundle seeding into user harness state",
  );

  assertIncludes(
    community,
    "applyPrivateCommunityPluginManifest as applyPrivateCommunityPluginManifestImpl",
    "community barrel imports private manifest apply action",
  );
  assertIncludes(
    community,
    "export const applyPrivateCommunityPluginManifest = applyPrivateCommunityPluginManifestImpl;",
    "community barrel exports private manifest apply action",
  );

  assertIncludes(contract, "## Apply Bridge", "private manifest contract documents apply bridge");
  assertIncludes(
    contract,
    "return all compiler rejections before any",
    "private manifest contract requires reject-before-write",
  );
  assertIncludes(
    contract,
    "applies MCP entries only",
    "private manifest contract keeps apply bridge MCP-only",
  );
  assertIncludes(
    contract,
    "reuse an existing community app bundle",
    "private manifest contract requires idempotent reuse",
  );
  assertIncludes(
    contract,
    "re-enable and reseed",
    "private manifest contract requires existing-row reconciliation",
  );
  assertIncludes(
    contract,
    "Runtime execution still comes only from user-owned harness app state.",
    "private manifest contract preserves runtime boundary",
  );

  assertIncludes(
    packageJson,
    "\"check:private-community-plugin-manifest-apply-proof\"",
    "package script for private manifest apply proof",
  );

  console.log("private_community_plugin_manifest_apply_contract_proof: ok");
}

main();
