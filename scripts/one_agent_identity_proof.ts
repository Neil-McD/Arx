// One agent per community. The retired "personal_agent" name was rewritten on
// every old post, reply and receipt and removed (Nov 7); it remains only on the
// retired AI feed's posts until those tables go. New code uses "community_agent"
// (acting on its own) or "community_agent_for_member" (inside one member's permissions).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const ALLOWED = new Map<string, string>([
]);

const productFiles = execFileSync("git", ["ls-files", "convex", "shared", "apps"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path) && !/\.test\./.test(path) && !path.includes("_generated"));
const offenders = productFiles.filter((path) => !ALLOWED.has(path) && read(path).includes("personal_agent"));
assert.deepEqual(offenders, [], `the retired personal_agent name must not spread: ${offenders.join(", ")}`);

const schema = read("convex/schema.ts");
assert.equal((schema.match(/"personal_agent"/g) ?? []).length, 0, "the retired value left the schema with the AI feed's tables");

const authority = read("shared/polynetAuthority.ts");
assert.match(authority, /\| "community_agent_for_member"\n\s*\| "external_mcp"\n\s*\| "community_agent"/, "the agent has two permission modes");
assert.match(read("convex/runtimeAgentLoop.ts"), /principalKind: communityOwned \? "community_agent" : "community_agent_for_member"/);

const surface = read("shared/runtimeInvocationSurface.ts");
assert.doesNotMatch(surface, /Polynet Intelligence|personal agent in Polynet|You do not belong to any community/, "the retired personal-agent prompt stays deleted");
assert.match(surface, /return normalizedThreadKey\.startsWith\(`\$\{COMMUNITY_AGENT_THREAD_KEY_PREFIX\}:`\);/, "every member-agent conversation is read-only history");

const interactions = read("convex/communityInteractions.ts");
assert.doesNotMatch(interactions, /presentInteractionActorType|RETIRED_PERSONAL_AGENT/, "no translation of the retired name is left");
assert.doesNotMatch(interactions, /asPersonalAgent/, "the old composer flag stays deleted");

for (const [path, reason] of ALLOWED) {
  assert.ok(read(path).includes("personal_agent"), `remove ${path} from ALLOWED (${reason}): it no longer mentions the retired name`);
}
console.log(`one_agent_identity_proof: ok (${productFiles.length} files, ${ALLOWED.size} named exceptions)`);
