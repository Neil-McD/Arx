import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const contract = JSON.parse(
  read("shared/contracts/cached_production_client_compatibility_v1.json"),
) as {
  contract_id: string;
  version: number;
  production_origin: string;
  production_build_id: string;
  staging_deployment: string;
  required_public_operations: string[];
  candidate_already_supported_operations: string[];
  compatibility_aliases: Record<string, string>;
  retired_tombstone_operations: string[];
};

assert.equal(contract.contract_id, "cached_production_client_compatibility_v1");
assert.equal(contract.version, 1);
assert.equal(contract.production_origin, "https://polynet.ai");
assert.equal(
  contract.production_build_id,
  "dbec82f5869384a087ab5ea96d0b25c53f8da284",
);
assert.equal(contract.staging_deployment, "quick-porcupine-949");
assert.equal(contract.required_public_operations.length, 246);
assert.equal(contract.candidate_already_supported_operations.length, 113);
assert.equal(Object.keys(contract.compatibility_aliases).length, 116);
assert.equal(contract.retired_tombstone_operations.length, 17);

const exactRetiredOperations = [
  "appOAuth:beginUserPlatformAppOAuth",
  "appOAuth:finalizeUserPlatformAppOAuth",
  "community:connectCommunityApp",
  "community:createCommunityResourcePageDraftFromSource",
  "community:listCommunityAppMounts",
  "community:refreshCommunityApp",
  "community:setupImportedCommunityMcpApp",
  "community:unmountCommunityApp",
  "community:updateCommunityAppMount",
  "harnessMounts:listEffectiveMcpApps",
  "userPlatformAppMounts:connectUserPlatformApp",
  "userPlatformAppMounts:listUserPlatformAppMounts",
  "userPlatformAppMounts:reconnectUserPlatformApp",
  "userPlatformAppMounts:refreshUserPlatformApp",
  "userPlatformAppMounts:setupImportedCommunityMcpUserHarness",
  "userPlatformAppMounts:unmountUserPlatformApp",
  "userPlatformAppMounts:updateUserPlatformAppMount",
];
assert.deepEqual(contract.retired_tombstone_operations, exactRetiredOperations);

const required = new Set(contract.required_public_operations);
const alreadySupported = new Set(
  contract.candidate_already_supported_operations,
);
const aliases = new Set(Object.keys(contract.compatibility_aliases));
const retired = new Set(contract.retired_tombstone_operations);
assert.equal(required.size, contract.required_public_operations.length);
assert.equal(alreadySupported.size, 113);
assert.equal(aliases.size, 116);
assert.equal(retired.size, 17);

for (const operation of alreadySupported) {
  assert.ok(required.has(operation));
  assert.equal(aliases.has(operation), false);
  assert.equal(retired.has(operation), false);
}
for (const operation of aliases) {
  assert.ok(required.has(operation));
  assert.equal(retired.has(operation), false);
}
for (const operation of retired) {
  assert.ok(required.has(operation));
}
assert.equal(alreadySupported.size + aliases.size + retired.size, required.size);

for (const [legacyOperation, canonicalOperation] of Object.entries(
  contract.compatibility_aliases,
)) {
  const [legacyModule, legacyName] = legacyOperation.split(":");
  const [canonicalModule, canonicalName] = canonicalOperation.split(":");
  assert.equal(
    legacyName,
    canonicalName,
    `${legacyOperation} must preserve the operation name`,
  );
  assert.ok(
    legacyModule === "community" || legacyModule === "billing",
    `${legacyOperation} must live in one bounded facade`,
  );
  const facadePath = `convex/${legacyModule}.ts`;
  const canonicalPath = `convex/${canonicalModule}.ts`;
  assert.equal(existsSync(join(root, facadePath)), true);
  assert.equal(existsSync(join(root, canonicalPath)), true);
  const facade = read(facadePath);
  const canonical = read(canonicalPath);
  assert.match(facade, new RegExp(`export const ${legacyName}\\b`));
  assert.match(
    facade,
    new RegExp(`${canonicalModule}\\.${canonicalName}\\b`),
  );
  assert.match(canonical, new RegExp(`export const ${canonicalName}\\b`));
}

for (const operation of contract.retired_tombstone_operations) {
  const [moduleName, exportName] = operation.split(":");
  const sourcePath = `convex/${moduleName}.ts`;
  assert.equal(existsSync(join(root, sourcePath)), true);
  assert.match(read(sourcePath), new RegExp(`export const ${exportName}\\b`));
}

const expectedFacadeExports = new Map<string, string[]>();
for (const operation of [
  ...Object.keys(contract.compatibility_aliases),
  ...contract.retired_tombstone_operations,
]) {
  const [moduleName, exportName] = operation.split(":");
  const names = expectedFacadeExports.get(moduleName) ?? [];
  names.push(exportName);
  expectedFacadeExports.set(moduleName, names);
}
for (const [moduleName, expectedNames] of expectedFacadeExports) {
  const source = read(`convex/${moduleName}.ts`);
  const actualNames = Array.from(
    source.matchAll(/export const ([A-Za-z0-9_]+)/g),
    (match) => match[1],
  );
  assert.deepEqual(
    actualNames.sort(),
    expectedNames.sort(),
    `${moduleName} must expose exactly its pinned compatibility operations`,
  );
}

const compatibilityHelper = read("convex/thirdPartyMcpCompatibility.ts");
assert.match(compatibilityHelper, /third_party_mcp_retired/);
assert.match(
  compatibilityHelper,
  /Third-party MCP connections are no longer supported by Polynet\./,
);

console.log(
  "PASS: cached production client contract is complete: 113 canonical calls + 116 compatibility aliases + 17 inert retirement tombstones",
);
