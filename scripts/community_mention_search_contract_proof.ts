import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const packageJson = read("package.json");
const communityDirectory = read("convex/communityDirectory.ts");
const gateway = read("shared/cloudCommunityDirectoryGateway.ts");
const autocomplete = read("apps/web/src/components/communityMentionAutocomplete.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const sender = read("shared/useCommunityChatMutationController.ts");

assert.match(
  packageJson,
  /"check:community-mention-search-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_mention_search_contract_proof\.ts"/,
  "package scripts must expose the community mention search proof",
);

assert.match(
  communityDirectory,
  /export const searchCommunityMentionCandidates = query\(/,
  "community directory must expose a backend-scoped mention search query",
);
assert.match(
  communityDirectory,
  /resolveCommunityDirectoryContext\([\s\S]*requireCommunityChatAccess/,
  "mention search must reuse the community directory chat-access gate",
);
assert.match(
  communityDirectory,
  /searchCommunityMentionCandidates[\s\S]*listCanonicalCommunityMemberMembershipRows\([\s\S]*communityId: args\.communityId/,
  "mention search user candidates must come from canonical active community membership rows",
);
assert.match(
  communityDirectory,
  /searchCommunityMentionCandidates[\s\S]*await addUserCandidate\(community\.ownerId, "owner"\)[\s\S]*for \(const row of canonicalRows\.rows\)/,
  "mention search must include the scoped owner row plus canonical member rows",
);
assert.match(
  communityDirectory,
  /searchCommunityMentionCandidates[\s\S]*requireCommunityManager\([\s\S]*pushEverybodyCandidate/,
  "@everybody search exposure must be manager-gated on the backend",
);
assert.match(
  communityDirectory,
  /includeRoles: v\.optional\(v\.boolean\(\)\)[\s\S]*const includeRoles = args\.includeRoles !== false[\s\S]*const canMentionEverybody = includeRoles && await/,
  "@everybody search exposure must be explicitly suppressible for reply composers",
);
assert.match(
  communityDirectory,
  /kind: "community_agent"[\s\S]*agent_key: "community_agent"/,
  "community-agent candidates must use the canonical scoped agent key",
);
assert.match(
  gateway,
  /export async function searchCloudCommunityMentionCandidates[\s\S]*includeRoles\?: boolean[\s\S]*communityDirectory:searchCommunityMentionCandidates[\s\S]*includeRoles: params\.includeRoles \?\? true/,
  "web gateway must call the scoped backend mention search query with an explicit role-row flag",
);
assert.match(
  autocomplete,
  /onActiveQueryChange\?: \(query: string \| null\) => void/,
  "autocomplete hook must report active queries so zero-local-result searches can hydrate remotely",
);
assert.match(
  chatPanel,
  /searchCloudCommunityMentionCandidates[\s\S]*mentionSearchSeqRef[\s\S]*window\.setTimeout[\s\S]*if \(mentionSearchSeqRef\.current !== seq\) return/,
  "chat panel must debounce scoped search and ignore stale results",
);
assert.match(
  chatPanel,
  /activeMentionIncludesRoles = activeMentionOwner === "main" && !replyingToMessage[\s\S]*includeRoles/,
  "chat panel must only request role mention candidates for the non-reply main composer",
);
assert.match(
  chatPanel,
  /mergeMentionCandidates\(remoteMainMentionCandidates, localMainMentionCandidates\)[\s\S]*mergeMentionCandidates\(remoteDrawerMentionCandidates, localReplyMentionCandidates\)/,
  "remote scoped candidates must take precedence while loaded-directory candidates remain fallback per composer surface",
);
assert.doesNotMatch(
  chatPanel,
  /const memberCandidates = Object\.values\(profilesByUserId\)/,
  "mention candidates must never be generated from the global profile cache",
);

assert.match(
  sender,
  /textContainsMentionToken\(bodyToSend, mention\.token\)/,
  "send-time mention validation must remain the authority after autocomplete selection",
);

console.log("community_mention_search_contract_proof: ok");
