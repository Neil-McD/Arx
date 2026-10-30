import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const contract = read("shared/communityFounderWelcome.ts");
const interactions = read("convex/communityInteractions.ts");
const lifecycle = read("convex/communityLifecycle.ts");
const knowledge = read("convex/communityBuilderKnowledgeSetup.ts");
const baseline = read("scripts/foundation_baseline_gate.sh");
const packageJson = read("package.json");

assert.match(contract, /founder_welcome:v\$\{FOUNDER_WELCOME_VERSION\}:\$\{normalizedCommunityId\}/);
assert.match(contract, /I’m your community concierge/);
assert.match(contract, /Reply to me in this thread, or type @ and pick my name anywhere in chat/);

assert.match(
  interactions,
  /founderBootstrap: v\.optional\(v\.boolean\(\)\)[\s\S]*communityFounderWelcomeIdempotencyKey\(args\.communityId\)[\s\S]*community_founder_welcome_contract_invalid/,
);
assert.match(
  interactions,
  /String\(community\.ownerId\) !== String\(args\.userId\)[\s\S]*community_founder_welcome_owner_required/,
);
assert.match(
  interactions,
  /buildCommunityFounderWelcomeText\([\s\S]*actorType: "community_agent"[\s\S]*actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY/,
);
assert.match(
  interactions,
  /!founderBootstrap && root\.composerPayloadHash !== composerPayloadHash/,
  "recovery must preserve the first canonical welcome even if mutable labels later change",
);

for (const source of [lifecycle, knowledge]) {
  assert.match(
    source,
    /ctx\.scheduler\.runAfter\([\s\S]*createCommunityAgentCanonicalInteractionInternal[\s\S]*communityFounderWelcomeIdempotencyKey[\s\S]*founderBootstrap: true/,
  );
}
assert.match(
  packageJson,
  /"check:community-founder-welcome-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_founder_welcome_contract_proof\.ts && vitest run convex\/communityFounderWelcome\.test\.ts convex\/communityBuilderKnowledgeSetup\.test\.ts"/,
);
assert.match(baseline, /Community founder welcome contract/);

console.log("community_founder_welcome_contract_proof: ok");
