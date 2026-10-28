import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const projection = read("convex/userProfileProjection.ts");
const profiles = read("convex/profiles.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const communityChat = read("convex/communityChat.ts");
const communityPublic = read("convex/communityPublic.ts");
const accountSetupCore = read("convex/accountSetupCore.ts");
const profileHydration = read(
  "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
);

assert.match(
  projection,
  /resolveUserProfileDisplayProjectionForUser/,
  "user profile display projection must be centralized",
);
assert.match(
  projection,
  /profile\?\.displayName\)[\s\S]*\?\? normalizeOptionalText\(user\.displayName\)/,
  "display projection must fall back from profile display name to account display name",
);
assert.match(
  projection,
  /storageAvatarUrl \?\? profileAvatarUrl \?\? accountAvatarUrl/,
  "display projection must fall back from profile avatar to account avatar",
);
assert.match(
  profiles,
  /listProfilesByUserIds[\s\S]*resolveUserProfileDisplayProjectionForUser/,
  "shared profile list must use display fallback projection",
);
assert.match(
  communityChat,
  /resolveCommunityTypingPresence/,
  "community typing must use its canonical presence owner",
);
assert.match(read("convex/communityTypingPresenceCore.ts"), /resolveUserProfileDisplayProjection\(args\.ctx, row\.userId\)/, "typing identities must use display fallback projection");
assert.match(
  communityPublic,
  /resolvePublicProfileFaceFields[\s\S]*resolveUserProfileDisplayProjection/,
  "public community faces must use display fallback projection",
);
assert.match(
  accountSetupCore,
  /displayName: params\.detail\?\.displayName \?\? null/,
  "account setup completion must remain first-party profile-name based",
);
assert.match(
  accountSetupCore,
  /avatarUrl: params\.detail\?\.avatarUrl \?\? null/,
  "account setup completion must remain first-party profile-avatar based",
);
assert.match(
  profileHydration,
  /display_name:[\s\S]*cloudProfile\.display_name \?\? existing\?\.display_name \?\? null/,
  "current-user display map must preserve account display fallback while profile detail is incomplete",
);

console.log("PASS: profile display fallback contract is canonical.");
