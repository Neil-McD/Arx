import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sourceFiles(path: string): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".next" ||
        entry.name === "_generated"
      ) {
        continue;
      }
      out.push(...sourceFiles(child));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      out.push(child);
    }
  }
  return out;
}

const packageJson = read("package.json");
const productionFacade = read("convex/community.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const launchStatus = read("convex/communityLaunchSetup.ts");
const launchStatusModel = read("shared/communityLaunchSetup.ts");
const publishReadiness = read("shared/communityPublishReadiness.ts");
const funnelGateway = read("shared/cloudCommunityFunnelGateway.ts");
const schema = read("convex/schema.ts");
const generatedApi = read("convex/_generated/api.d.ts");

assert.match(
  packageJson,
  /"check:community-launch-contract-transition-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_launch_contract_transition_proof\.ts"/,
  "the rolling launch-contract transition proof must remain runnable",
);

assert.match(
  productionFacade,
  /export const saveCommunityLaunchProfile =[\s\S]*communityLifecycle\.saveCommunityLaunchProfile[\s\S]*export const getCommunityLaunchSetupStatus =[\s\S]*communityLaunchSetup\.getCommunityLaunchSetupStatus/,
  "the production compatibility facade must delegate to canonical domain owners",
);
assert.doesNotMatch(
  productionFacade.split(
    "// Cached clients may still invoke the retired third-party MCP names.",
  )[0],
  /\b(?:query|mutation|action)\s*\(|\bctx\.|\bdb\./,
  "the community alias facade must not own transport, authorization, or data logic",
);

assert.match(
  lifecycle,
  /export const saveCommunityAbout = mutation\(\{[\s\S]*requireCommunityManager[\s\S]*normalizeOptionalText\(args\.about, 8_000\)[\s\S]*ctx\.db\.patch[\s\S]*about,/,
  "the new narrow About mutation must remain manager-authorized and bounded",
);
assert.match(
  funnelGateway,
  /saveCloudCommunityAbout<[\s\S]*client\.mutation\("communityLifecycle:saveCommunityAbout"[\s\S]*about: params\.about/,
  "new first-party clients must use the narrow About contract",
);

assert.match(
  lifecycle,
  /Rolling-deployment compatibility[\s\S]*export const saveCommunityLaunchProfile = mutation\(\{[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManager[\s\S]*identityChanged[\s\S]*brandingChanged[\s\S]*visibilityChanged[\s\S]*requireCommunityOwner[\s\S]*by_slug[\s\S]*community_slug_taken[\s\S]*requireCommunityPublishReadinessTransition[\s\S]*maybeDeleteStorageAsset[\s\S]*mapCommunityRecord/,
  "the legacy profile mutation must preserve authentication, manager access, owner-only changes, uniqueness, publish readiness, and storage cleanup",
);
assert.match(
  publishReadiness,
  /getCommunityPublishReadinessBlockingFields[\s\S]*nextMissing[\s\S]*currentMissing[\s\S]*nextMissing\.filter/,
  "publish readiness must block new regressions while allowing grandfathered rows to repair incrementally",
);
assert.match(
  launchStatus,
  /Rolling-deployment compatibility[\s\S]*export const getCommunityLaunchSetupStatus = query\(\{[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityManager[\s\S]*buildCommunityLaunchSetupStatus/,
  "the legacy launch-status query must preserve authenticated manager access",
);
assert.match(
  launchStatusModel,
  /export function buildCommunityLaunchSetupStatus[\s\S]*getCommunityPublishReadinessMissingFields[\s\S]*current_step:[\s\S]*percent:/,
  "the compatibility query must retain the known launch-status response model",
);

assert.match(
  generatedApi,
  /import type \* as community from "\.\.\/community\.js";/,
  "the generated Convex API must include the production compatibility facade",
);
assert.match(
  generatedApi,
  /import type \* as communityLaunchSetup from "\.\.\/communityLaunchSetup\.js";/,
  "the generated Convex API must include the compatibility query module",
);
assert.doesNotMatch(
  schema,
  /communityLaunchSetup|communityLaunchCompatibility/,
  "rolling API compatibility must not introduce product tables",
);
assert.equal(
  existsSync(join(root, "shared/cloudCommunityLaunchSetupGateway.ts")),
  false,
  "the retired first-party launcher gateway must not return",
);

const allowedLegacySymbolPaths = new Set([
  "convex/community.ts",
  "convex/communityLaunchCompatibility.test.ts",
  "convex/communityLifecycle.ts",
  "convex/communityLaunchSetup.ts",
  "convex/_generated/api.d.ts",
]);
for (const path of [
  ...sourceFiles("api"),
  ...sourceFiles("apps"),
  ...sourceFiles("services"),
  ...sourceFiles("shared"),
  ...sourceFiles("convex"),
]) {
  if (allowedLegacySymbolPaths.has(path)) continue;
  assert.doesNotMatch(
    read(path),
    /getCommunityLaunchSetupStatus|saveCommunityLaunchProfile/,
    `legacy launch RPC symbols must remain quarantined; found in ${path}`,
  );
}

console.log(
  "PASS: new and legacy community launch RPCs coexist without restoring a first-party launcher client",
);
