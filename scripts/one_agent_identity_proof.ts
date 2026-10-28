// One agent per community. The retired "personal_agent" name may appear only on
// stored history that the table-drop release rewrites or drops; new code uses
// "community_agent" (acting on its own) or "community_agent_for_member" (acting
// inside one member's permissions).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const ALLOWED = new Map<string, string>([
  ["convex/schema.ts", "old chat posts, replies and receipts keep the stored value until the table-drop rewrite; AI feed posts until those tables drop"],
  ["shared/communityAgentIdentity.ts", "RETIRED_PERSONAL_AGENT_ACTOR_TYPE: the one name for the stored value"],
  ["shared/communityEvidenceContract.ts", "AI feed lineage; goes with the AI feed tables"],
  ["convex/communityAiFeedEvidenceCore.ts", "AI feed lineage; goes with the AI feed tables"],
]);

const productFiles = execFileSync("git", ["ls-files", "convex", "shared", "apps"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path) && !/\.test\./.test(path) && !path.includes("_generated"));
const offenders = productFiles.filter((path) => !ALLOWED.has(path) && read(path).includes("personal_agent"));
assert.deepEqual(offenders, [], `the retired personal_agent name must not spread: ${offenders.join(", ")}`);

const schema = read("convex/schema.ts");
assert.equal((schema.match(/"personal_agent"/g) ?? []).length, 4, "schema keeps the retired value on exactly four stored fields");
assert.match(schema, /v\.literal\("community_agent_for_member"\),\s*v\.literal\("personal_agent"\), \/\/ retired name on old receipts/);

const authority = read("shared/polynetAuthority.ts");
assert.match(authority, /\| "community_agent_for_member"\n\s*\| "external_mcp"\n\s*\| "community_agent"/, "the agent has two permission modes");
assert.match(read("convex/runtimeAgentLoop.ts"), /principalKind: communityOwned \? "community_agent" : "community_agent_for_member"/);

const surface = read("shared/runtimeInvocationSurface.ts");
assert.doesNotMatch(surface, /Polynet Intelligence|personal agent in Polynet|You do not belong to any community/, "the retired personal-agent prompt stays deleted");
assert.match(surface, /return normalizedThreadKey\.startsWith\(`\$\{COMMUNITY_AGENT_THREAD_KEY_PREFIX\}:`\);/, "every member-agent conversation is read-only history");

const interactions = read("convex/communityInteractions.ts");
assert.match(interactions, /actor_type: presentInteractionActorType\(root\.actorType\)/, "old posts read as the community agent");
assert.match(interactions, /actor_type: presentInteractionActorType\(reply\.actorType\)/, "old replies read as the community agent");
assert.match(interactions, /asPersonalAgent: v\.optional\(v\.boolean\(\)\)/, "the cached production web's composer flag stays accepted until the production release");

for (const [path, reason] of ALLOWED) {
  assert.ok(read(path).includes("personal_agent"), `remove ${path} from ALLOWED (${reason}): it no longer mentions the retired name`);
}
console.log(`one_agent_identity_proof: ok (${productFiles.length} files, ${ALLOWED.size} named exceptions)`);
