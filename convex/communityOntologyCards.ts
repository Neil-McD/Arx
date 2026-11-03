import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
import { communityResourceIsMemberVisiblePage, communityResourceModuleIsMemberLive } from "../shared/communityResourceVisibility";
import { COMMUNITY_CARD_LIMITS, type CommunityCardPerson } from "../shared/communityOntology.ts";
import { resolveCommunityEntryPolicy } from "./communityCore";
import { communitySiteUrl } from "./communitySites";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

// The parts of the community card (shared/communityOntology.ts) that don't
// depend on who reads it: identity, who holds which role, the courses. The
// canonical door adds the reader's own channels and the coming events (both
// already filtered by its lens) and draws the card. Every read is bounded.
const LESSON_SCAN_BOUND = 300;

export const loadCommunityCardSourceInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community as any)) return null;

    const people: CommunityCardPerson[] = [];
    const named = async (userId: any, role: CommunityCardPerson["role"]) => {
      const user = (await ctx.db.get(userId)) as any;
      if (!user) return;
      const detail = await ctx.db.query("userProfileDetails").withIndex("by_user", (q) => q.eq("userId", userId)).first();
      const name = String((detail as any)?.displayName ?? user.displayName ?? user.handle ?? "").trim();
      people.push({ name: name || "Member", handle: typeof user.handle === "string" ? user.handle : null, role });
    };
    await named(community.ownerId, "owner");
    for (const role of ["admin", "moderator"] as const) {
      const rows = await ctx.db.query("communityMemberships")
        .withIndex("by_community_role_active", (q) => q.eq("communityId", args.communityId).eq("role", role).eq("active", true))
        .take(COMMUNITY_CARD_LIMITS.people);
      for (const row of rows) if (String(row.userId) !== String(community.ownerId)) await named(row.userId, role);
    }

    const modules = await ctx.db.query("communityResourceModules")
      .withIndex("by_community_sortOrder", (q) => q.eq("communityId", args.communityId))
      .take(COMMUNITY_CARD_LIMITS.courses * 2);
    const courses = [];
    for (const module of modules) {
      // The same visibility rules as resources/: what members actually see.
      if (!communityResourceModuleIsMemberLive(module as any)) continue;
      const live = new Set([String(module._id)]);
      // Bounded: a course with more rows than the scan says "N+" rather than a wrong exact count.
      const rows = await ctx.db.query("communityResources")
        .withIndex("by_community_module", (q) => q.eq("communityId", args.communityId).eq("moduleId", module._id))
        .take(LESSON_SCAN_BOUND);
      courses.push({
        title: String(module.name ?? "").trim() || "Course",
        lessons: rows.filter((row: any) => communityResourceIsMemberVisiblePage(row, live)).length,
        lessonsCapped: rows.length >= LESSON_SCAN_BOUND,
      });
      if (courses.length >= COMMUNITY_CARD_LIMITS.courses) break;
    }

    const site = await communitySiteUrl(ctx, community);
    let canonicalUrl = site;
    if (!canonicalUrl) {
      try { canonicalUrl = `${readCanonicalPublicAppOrigin()}/c/${community.slug}`; } catch { canonicalUrl = `/c/${community.slug}`; }
    }
    return {
      name: String(community.name ?? "").trim() || String(community.slug),
      slug: String(community.slug),
      oneLiner: typeof community.oneLiner === "string" ? community.oneLiner : null,
      about: typeof community.about === "string" ? community.about : null,
      visibility: community.visibility === "published" ? "published" as const : "unlisted" as const,
      entryPolicy: resolveCommunityEntryPolicy(community as any),
      memberCount: Math.max(0, Math.floor(Number(community.activeMemberCount) || 0)),
      canonicalUrl,
      people,
      courses,
    };
  },
});
