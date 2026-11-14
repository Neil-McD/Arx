// What's left of community sites (Neil, Nov 13: custom sites are removed;
// a community's page is /c/<slug> in the app, convex/communityLanding.ts).
//
// - A community's handle: 3 to 32 lowercase letters, digits and dashes,
//   starting and ending with a letter or digit (the app checks the same).
// - The owner's old switch, "where members spend time": the cached production
//   app and an owner's approved AI request can still set it, so it keeps its
//   stored value for its own bookkeeping (communityLifecycle,
//   communityOwnerApprovals). Members are never sent anywhere by it: they
//   always use the app. It goes with the site tables (slice 3).

const COMMUNITY_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export function requireCommunitySlugShape(slug: string): void {
  if (!COMMUNITY_SLUG.test(String(slug ?? ""))) throw new Error("community_slug_invalid");
}

export type MemberExperience = "app" | "site";
type ExperienceCommunity = { _id: any; slug?: unknown; memberExperience?: unknown };

// A site was once deployed for it (the switch could only choose "site" then).
export async function communityHasCustomSite(ctx: any, communityId: any): Promise<boolean> {
  return Boolean(await ctx.db.query("communitySiteDeploys").withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId)).first());
}

// Where members spend time: always Polynet's app.
export async function communityMemberExperience(_ctx: any, _community: ExperienceCommunity): Promise<MemberExperience> {
  return "app";
}

// The switch as stored, for its own bookkeeping only.
export async function storedCommunityMemberExperience(ctx: any, community: ExperienceCommunity): Promise<MemberExperience> {
  if (community.memberExperience !== "site") return "app";
  return (await communityHasCustomSite(ctx, community._id)) ? "site" : "app";
}
