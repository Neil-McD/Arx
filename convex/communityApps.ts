import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireCommunityChatAccess } from "./communityCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { communityIsActive } from "../shared/communityLifecycle";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  COMMUNITY_APP_HANDOFF_TTL_MS,
  COMMUNITY_APP_SESSION_TTL_MS,
  normalizeCommunityAppOrigin,
} from "../shared/communityAppSession";

// Community front ends. A community's own domain (origin) is registered to
// that community. A member already signed in to Polynet hops through Polynet's
// login, which issues a one-time code for that domain; the community edge swaps
// it for a session it keeps in an HttpOnly cookie. The front end then acts as
// that member, in that community, in the member lane. Authority is re-derived
// from current membership on every request by the canonical executor.

const MAX_ROWS_PRUNED = 20;

function hashLooksValid(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

async function memberHasAccess(ctx: any, communityId: any, userId: any): Promise<boolean> {
  try {
    await requireCommunityChatAccess({ ctx, communityId, userId });
    return true;
  } catch {
    return false;
  }
}

// Operator setup until the CLI registers domains. One domain belongs to one community.
export const registerCommunityDomainInternal = internalMutation({
  args: { communityId: v.id("communities"), origin: v.string() },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.communityId))) throw new Error("community_not_found");
    const origin = normalizeCommunityAppOrigin(args.origin);
    let polynetOrigin: string | null = null;
    try {
      polynetOrigin = readCanonicalPublicAppOrigin();
    } catch {
      polynetOrigin = null;
    }
    if (!origin || origin === polynetOrigin) throw new Error("community_domain_invalid");
    const existing = await ctx.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", origin)).first();
    if (existing) throw new Error("community_domain_taken");
    const domainId = await ctx.db.insert("communityDomains", { communityId: args.communityId, origin, createdAt: Date.now() });
    return { id: String(domainId), origin };
  },
});

// Removing a domain ends its sign-in immediately; its sessions stop resolving.
// What anyone may see about a community on its own site, signed in or not: the
// same identity its public join page shows. Members, posts and events stay private.
export const getCommunityPublicIdentityByOriginInternal = internalQuery({
  args: { origin: v.string() },
  handler: async (ctx, args) => {
    const origin = normalizeCommunityAppOrigin(args.origin);
    if (!origin) return null;
    const domain = await ctx.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", origin)).first();
    const community = domain ? await ctx.db.get(domain.communityId) : null;
    if (!community || !communityIsActive(community as any)) return null;
    const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
    return {
      slug: String(community.slug ?? ""),
      name: text(community.name, 120) ?? String(community.slug ?? ""),
      one_liner: text((community as any).oneLiner, 500),
      about: text((community as any).about, 4000),
      member_count: Math.max(0, Math.floor(Number((community as any).activeMemberCount) || 0)),
    };
  },
});

// The member's Polynet account as every community site shows it (the shell):
// who they are, their role here, and where Polynet keeps the rest (their
// communities, Discover, settings, messages, Studio). Any script on the site can
// read this, so it never says which other communities the member belongs to.
export const getCommunityAppAccountInternal = internalQuery({
  args: { userId: v.id("users"), currentCommunityId: v.id("communities") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const community = await ctx.db.get(args.currentCommunityId) as any;
    if (!user || !community || !communityIsActive(community)) return null;
    let role: string | null = String(community.ownerId) === String(args.userId) ? "owner" : null;
    if (!role) {
      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.currentCommunityId).eq("userId", args.userId))
        .first();
      role = membership?.active === true ? membership.role : null;
    }
    if (!role) return null;
    const display = await resolveUserProfileDisplayProjection(ctx, args.userId);
    let studioOrigin: string | null = null;
    try {
      studioOrigin = readCanonicalPublicAppOrigin();
    } catch {
      studioOrigin = null;
    }
    const studio = (path: string) => (studioOrigin ? `${studioOrigin}${path}` : null);
    const slug = String(community.slug ?? "");
    return {
      member: {
        name: display.display_name ?? user.handle ?? "Member",
        handle: typeof user.handle === "string" ? user.handle : null,
        avatar_url: display.avatar_url ?? null,
      },
      community: {
        slug,
        name: String(community.name ?? "").trim() || slug,
        role,
        studio_url: studio(`/c/${encodeURIComponent(slug)}`),
      },
      links: {
        communities: studio("/"),
        discover: studio("/discover"),
        settings: studio("/settings/profile"),
        messages: studio("/?dm=inbox"),
      },
    };
  },
});

export const removeCommunityDomainInternal = internalMutation({
  args: { origin: v.string() },
  handler: async (ctx, args) => {
    const domain = await ctx.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", args.origin)).first();
    if (!domain) return { removed: false };
    const sessions = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_domain_user_expiresAt", (q) => q.eq("domainId", domain._id))
      .take(500);
    for (const row of sessions) await ctx.db.delete(row._id);
    await ctx.db.delete(domain._id);
    return { removed: true };
  },
});

// Step 1, called by Polynet's login bridge for an already-verified Polynet
// session: a one-time code for a registered domain of a community the user belongs to.
export const createCommunityAppHandoffInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communitySlug: v.string(),
    origin: v.string(),
    codeHash: v.string(),
    stateHash: v.string(),
  },
  handler: async (ctx, args) => {
    if (!hashLooksValid(args.codeHash) || !hashLooksValid(args.stateHash)) {
      return { ok: false as const, reason: "invalid_request" as const };
    }
    const origin = normalizeCommunityAppOrigin(args.origin);
    const community = await ctx.db.query("communities").withIndex("by_slug", (q) => q.eq("slug", args.communitySlug)).first();
    const domain = origin
      ? await ctx.db.query("communityDomains").withIndex("by_origin", (q) => q.eq("origin", origin)).first()
      : null;
    if (!community || !domain || domain.communityId !== community._id) {
      return { ok: false as const, reason: "address_not_registered" as const };
    }
    if (!(await memberHasAccess(ctx, community._id, args.userId))) {
      return { ok: false as const, reason: "not_a_member" as const, communitySlug: community.slug };
    }
    const nowMs = Date.now();
    const expired = await ctx.db
      .query("communityAppHandoffs")
      .withIndex("by_user_expiresAt", (q) => q.eq("userId", args.userId).lt("expiresAt", nowMs))
      .take(MAX_ROWS_PRUNED);
    for (const row of expired) await ctx.db.delete(row._id);
    await ctx.db.insert("communityAppHandoffs", {
      codeHash: args.codeHash, stateHash: args.stateHash, domainId: domain._id,
      userId: args.userId, expiresAt: nowMs + COMMUNITY_APP_HANDOFF_TTL_MS,
    });
    return { ok: true as const };
  },
});

// Step 2, called only by the community edge. A code works once, within its
// lifetime, for the domain and state it was issued to.
export const consumeCommunityAppHandoffInternal = internalMutation({
  args: { codeHash: v.string(), stateHash: v.string(), origin: v.string(), tokenHash: v.string(), watchTokenHash: v.string() },
  handler: async (ctx, args) => {
    const handoff = await ctx.db
      .query("communityAppHandoffs")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (!handoff) return { ok: false as const, reason: "code_invalid" as const };
    // Any presentation burns the code, so a leaked code cannot be retried.
    await ctx.db.delete(handoff._id);
    const nowMs = Date.now();
    const domain = await ctx.db.get(handoff.domainId);
    if (
      handoff.expiresAt <= nowMs ||
      handoff.stateHash !== args.stateHash ||
      !domain ||
      domain.origin !== normalizeCommunityAppOrigin(args.origin) ||
      !hashLooksValid(args.tokenHash) ||
      !hashLooksValid(args.watchTokenHash)
    ) {
      return { ok: false as const, reason: "code_invalid" as const };
    }
    if (!(await memberHasAccess(ctx, domain.communityId, handoff.userId))) {
      return { ok: false as const, reason: "not_a_member" as const };
    }
    const expired = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_domain_user_expiresAt", (q) => q.eq("domainId", domain._id).eq("userId", handoff.userId).lt("expiresAt", nowMs))
      .take(MAX_ROWS_PRUNED);
    for (const row of expired) await ctx.db.delete(row._id);
    const expiresAt = nowMs + COMMUNITY_APP_SESSION_TTL_MS;
    await ctx.db.insert("communityAppSessions", {
      tokenHash: args.tokenHash, watchTokenHash: args.watchTokenHash, domainId: domain._id,
      communityId: domain.communityId, userId: handoff.userId, expiresAt,
    });
    return { ok: true as const, expiresAt };
  },
});

export const revokeCommunityAppSessionInternal = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (session) await ctx.db.delete(session._id);
    return { revoked: Boolean(session) };
  },
});

export const resolveCommunityAppSessionInternal = internalQuery({
  args: { tokenHash: v.string(), origin: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!session || session.expiresAt <= Date.now()) return { ok: false as const };
    const domain = await ctx.db.get(session.domainId);
    if (!domain || domain.origin !== args.origin || domain.communityId !== session.communityId) return { ok: false as const };
    const user = await ctx.db.get(session.userId);
    const authSubject = typeof user?.authSubject === "string" ? user.authSubject : "";
    if (!authSubject) return { ok: false as const };
    return { ok: true as const, userId: String(session.userId), authSubject, communityId: String(session.communityId) };
  },
});
