import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const gatewayFiles = [
  "shared/cloudCommunityAdminGateway.ts",
  "shared/cloudCommunityMembershipGateway.ts",
  "shared/cloudCommunityAccessGateway.ts",
  "shared/cloudCommunityAgentGateway.ts",
] as const;
const resourceController = readFileSync(join(root, "shared/useCommunityResourceController.ts"), "utf8");
const accessController = readFileSync(join(root, "shared/useWebCommunityAccessController.ts"), "utf8");
const eventsController = readFileSync(join(root, "shared/useCommunityEventsController.ts"), "utf8");

assert.match(
  packageJson,
  /"check:community-gateway-cleanup-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_gateway_cleanup_contract_proof\.ts"/,
  "package scripts should expose the community gateway cleanup proof",
);

for (const file of gatewayFiles) {
  const source = readFileSync(join(root, file), "utf8");
  assert.doesNotMatch(source, /init\?: RequestInit|void params\.init/, `${file} should not advertise ignored Convex RequestInit params`);
}

for (const [label, source] of [
  ["resource controller", resourceController],
  ["access controller", accessController],
  ["events controller", eventsController],
] as const) {
  assert.doesNotMatch(source, /communityFetchAbortScope|beginScopedAbortRequest|finishScopedAbortRequest|abortAllScopedRequests|isAbortError/, `${label} should not keep fake Convex abort plumbing`);
  assert.doesNotMatch(source, /init:\s*\{\s*signal:/, `${label} should not pass fake abort signals into Convex gateways`);
}

assert.match(
  resourceController,
  /const generation = \(resourceLoadGenerationRef\.current \+= 1\)[\s\S]*resourceLoadGenerationRef\.current !== generation[\s\S]*current\.setCommunityResourceModules\(directory\.modules\)/,
  "combined resource-directory loads should guard stale results before setting module state",
);
assert.match(
  resourceController,
  /const generation = \(resourceLoadGenerationRef\.current \+= 1\)[\s\S]*resourceLoadGenerationRef\.current !== generation[\s\S]*current\.setCommunityResources\(\(previousRows\)/,
  "combined resource-directory loads should guard stale results before setting resource state",
);
assert.match(
  accessController,
  /const seq = \(loadCommunitiesSeqRef\.current \+= 1\)[\s\S]*if \(loadCommunitiesSeqRef\.current !== seq\) return;[\s\S]*current\.setCommunities\(list\)/,
  "community access loads should guard stale results before setting communities",
);
assert.equal(
  existsSync(join(root, "shared/communityFetchAbortScope.ts")),
  false,
  "dead community fetch abort helper should be deleted once Convex gateways no longer consume fake RequestInit signals",
);

console.log("community_gateway_cleanup_contract_proof: ok");
