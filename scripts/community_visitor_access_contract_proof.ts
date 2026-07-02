import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const communityPublic = read("convex/communityPublic.ts");
const communityExperience = read("convex/communityExperience.ts");
const communityModule = read("convex/community.ts");
const communityCore = read("convex/communityCore.ts");

function sliceExport(source: string, name: string): string {
  const start = source.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = source.slice(start + 1);
  const end = rest.search(/\nexport (const|async function|function) /);
  return source.slice(start, end === -1 ? source.length : start + 1 + end);
}

const accessQuery = sliceExport(communityPublic, "resolvePublicCommunityAccessBySlug");

assert.match(
  accessQuery,
  /query\(\{[\s\S]*communitySlug: v\.string\(\)/,
  "public access resolution must be a public query keyed by slug only — no identity args",
);
assert.doesNotMatch(
  accessQuery,
  /authSubject: v\.|userId: v\./,
  "public access resolution must not accept caller-supplied identity — identity comes from ctx.auth alone",
);
assert.match(
  accessQuery,
  /try \{[\s\S]*findAuthenticatedActorState\(\{ ctx, authSubject: null \}\)[\s\S]*\} catch \{[\s\S]*userId = null/,
  "anonymous callers must resolve through the canonical identity path and fall back to userId null — one path, no fork",
);
assert.match(
  accessQuery,
  /if \(userId\) \{[\s\S]*communityMemberships[\s\S]*by_community_user/,
  "membership lookup must only run for identified callers",
);
assert.match(
  accessQuery,
  /resolveCommunityAccessBundle\(\{/,
  "the visitor state must come from the same access bundle members use — relation decides, no parallel ladder",
);
assert.match(
  accessQuery,
  /if \(!access\.relation\) return \{ ok: false as const \}/,
  "null relation (blocked or unpublished-to-strangers) must be absent, not teased",
);
assert.match(
  accessQuery,
  /user_id: userId \? access\.user_id : null/,
  "anonymous callers must get user_id null, never a stringified null",
);
assert.doesNotMatch(
  accessQuery,
  /communityMessages|requireCommunityChatAccess/,
  "the access query must not read chat content — visitor content flows through the public funnel projection only",
);

assert.match(
  communityExperience,
  /resolvePublicCommunityAccessBySlug,[\s\S]*\} from "\.\/communityPublic"/,
  "communityExperience must re-export the public access query (re-export chain hop 1)",
);
assert.match(
  communityModule,
  /resolvePublicCommunityAccessBySlug as resolvePublicCommunityAccessBySlugImpl/,
  "community.ts must import the public access query (re-export chain hop 2)",
);
assert.match(
  communityModule,
  /export const resolvePublicCommunityAccessBySlug = resolvePublicCommunityAccessBySlugImpl/,
  "community.ts must expose the public access query — without this the frontend silently gets undefined",
);

assert.match(
  communityCore,
  /: !isBlocked && args\.community\.visibility === "published"\s*\?\s*"visitor"/,
  "the visitor relation must require published visibility and no block — the ladder is the single source of the visitor state",
);
assert.match(
  communityCore,
  /export async function requireCommunityChatAccess[\s\S]*community_entitlement_required/,
  "chat access must stay entitlement-gated — visitor mode must never loosen requireCommunityChatAccess",
);

console.log("community visitor access contract proof passed");
