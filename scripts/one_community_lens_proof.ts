// Who someone is in a community, and what they may do, is decided once:
// resolveCommunityLens (convex/communityCore.ts). Code elsewhere asks it (or a
// wrapper: requireCommunityChatAccess, requireCommunityManager,
// requireCommunityModerator, resolveCommunityAccessBundle) instead of
// re-deriving entitlement, blocks or whether the community can run. Each other
// caller of those parts is named here with its reason.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PARTS = ["resolveCommunityMembershipEntitlementState", "communityUserIsBlocked", "resolveCommunityBuilderAccess"];
const ALLOWED = new Map<string, string>([
  ["convex/communityCore.ts", "the lens itself, and requireCommunityUserNotBlocked"],
  ["convex/communityBuilderAccessCore.ts", "the can-run decision the lens reads"],
  ["convex/communityCommerce.ts", "checkout refuses a blocked buyer before any membership exists"],
  ["convex/communityAccess.ts", "an owner granting access by hand refuses a blocked person before any membership exists"],
  ["convex/communityPublic.ts", "Discover lists only communities that can run; no person involved"],
  ["convex/communityAppJoin.ts", "the join page says whether the community can run, to anyone (signed out too); a person's access comes from the lens"],
]);

const files = execFileSync("git", ["ls-files", "convex", "shared"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.includes("_generated"));
const calls = new RegExp(`\\b(${PARTS.join("|")})\\s*\\(`);
const offenders: string[] = [];
const used = new Set<string>();
for (const path of files) {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n").filter((line) => calls.test(line) && !/^\s*export (async )?function/.test(line));
  if (!lines.length) continue;
  if (ALLOWED.has(path)) {
    used.add(path);
    continue;
  }
  offenders.push(`${path}: ${lines[0].trim()}`);
}
for (const path of ALLOWED.keys()) assert.ok(used.has(path), `remove ${path} from ALLOWED: it no longer derives access itself`);
assert.deepEqual(
  offenders,
  [],
  `Access re-derived outside the lens (use resolveCommunityLens or a wrapper, or name the file in ALLOWED with a reason):\n${offenders.join("\n")}`,
);
console.log(`one_community_lens_proof: ok (${files.length} files, ${ALLOWED.size} named exceptions)`);
