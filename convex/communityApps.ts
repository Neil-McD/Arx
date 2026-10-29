import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  normalizeCommunityRoleForOutput,
  pickMostRelevantCommunityMembership,
  requireCommunityChatAccess,
  resolveCommunityBrandingFields,
  resolveCommunityLens,
} from "./communityCore";
import { readCanonicalCommunityAgentContext } from "./communityAgentContext";
import { registeredSiteOrigin } from "./communitySites";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
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

// The member's role in an active community (owner, or an active membership),
// or null: what every personal page and its live watch require of a session,
// which can outlive the membership it was minted for. Studio's own access
// chain decides (the community can run, not blocked, entitled: a lapsed paid
// membership is out); the role is only for the page.
export async function communityAppMemberRole(ctx: any, community: any, userId: any): Promise<string | null> {
  if (!community || !communityIsActive(community)) return null;
  try {
    await requireCommunityChatAccess({ ctx, communityId: community._id, userId });
  } catch {
    return null;
  }
  if (String(community.ownerId) === String(userId)) return "owner";
  const membership = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId))
    .first();
  return membership?.active === true ? membership.role : null;
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
// Whether the community agent answers here: its owner hasn't turned it off, and
// an Agent plan (or the operator) pays for it. Sites say "off" up front rather
// than taking a question that can't be answered.
export async function communityAgentIsOn(ctx: any, communityId: any): Promise<boolean> {
  const agent = await readCanonicalCommunityAgentContext(ctx, communityId);
  if (!agent?.agentEnabled) return false;
  return (await resolveCommunityInferenceFundingAdmission(ctx, communityId)).ok;
}

export const communityAgentIsOnInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => await communityAgentIsOn(ctx, args.communityId),
});

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
      agent_on: await communityAgentIsOn(ctx, community._id),
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
    if (!user || !community) return null;
    const role = await communityAppMemberRole(ctx, community, args.userId);
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
        // Studio's community settings (/c/<slug> alone is the public join page).
        studio_url: studio(`/c/${encodeURIComponent(slug)}/settings/community`),
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

// "Your communities", only for a session minted on a private twin (the caller,
// httpCommunityApps, enforces that; a site's code never reaches this): every
// community the member owns or is entitled to, as Studio's own list counts
// them, oldest first. Each with its site on this environment's sites domain,
// when it has one.
const MEMBER_COMMUNITIES_MAX = 200;
export const listCommunityAppMemberCommunitiesInternal = internalQuery({
  args: { userId: v.id("users"), sitesDomain: v.optional(v.string()), hostSuffix: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const domain = String(args.sitesDomain ?? "").trim().toLowerCase();
    const suffix = String(args.hostSuffix ?? "").trim().toLowerCase();
    const picked: Array<{ community: any; role: string; since: number }> = [];
    const seen = new Set<string>();
    const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", args.userId)).take(MEMBER_COMMUNITIES_MAX);
    for (const community of owned) {
      if (!communityIsActive(community as any)) continue;
      seen.add(String(community._id));
      picked.push({ community, role: "owner", since: community.createdAt });
    }
    const rows = await ctx.db.query("communityMemberships").withIndex("by_user", (q) => q.eq("userId", args.userId)).take(MEMBER_COMMUNITIES_MAX * 2);
    const byCommunity = new Map<string, any[]>();
    for (const row of rows) byCommunity.set(String(row.communityId), [...(byCommunity.get(String(row.communityId)) ?? []), row]);
    for (const [communityId, memberships] of byCommunity) {
      if (seen.has(communityId) || picked.length >= MEMBER_COMMUNITIES_MAX) continue;
      const membership = pickMostRelevantCommunityMembership(memberships as any);
      const community = membership ? await ctx.db.get(membership.communityId) : null;
      if (!membership || !community || !communityIsActive(community as any)) continue;
      const lens = await resolveCommunityLens({ ctx, community: community as any, membership, userId: args.userId });
      if (!lens.membershipEntitled) continue;
      seen.add(communityId);
      picked.push({ community, role: normalizeCommunityRoleForOutput(membership.role) || "member", since: membership.createdAt });
    }
    picked.sort((a, b) => a.since - b.since);
    return await Promise.all(picked.map(async ({ community, role }) => {
      const slug = String(community.slug ?? "");
      const branding = await resolveCommunityBrandingFields(ctx, community as any);
      return {
        slug,
        name: String(community.name ?? "").trim().slice(0, 120) || slug,
        role,
        avatar_url: branding.avatar_url,
        site_url: await registeredSiteOrigin(ctx, community, domain, suffix),
      };
    }));
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
// session: a one-time code for a registered domain of a community the user
// belongs to. A site's private twin also signs in someone who isn't a member
// yet, for its Join page: only Polynet's code runs there, every personal page
// still requires membership, and the site's API re-checks it on every call.
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
    if (domain.kind !== "private" && !(await memberHasAccess(ctx, community._id, args.userId))) {
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
    if (domain.kind !== "private" && !(await memberHasAccess(ctx, domain.communityId, handoff.userId))) {
      return { ok: false as const, reason: "not_a_member" as const };
    }
    const expired = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_domain_user_expiresAt", (q) => q.eq("domainId", domain._id).eq("userId", handoff.userId).lt("expiresAt", nowMs))
      .take(MAX_ROWS_PRUNED);
    for (const row of expired) await ctx.db.delete(row._id);
    const expiresAt = nowMs + COMMUNITY_APP_SESSION_TTL_MS;
    // The session's kind is its origin's, fixed now: only a private twin's
    // session ever reaches personal endpoints.
    const kind = domain.kind === "private" ? "private" as const : "site" as const;
    await ctx.db.insert("communityAppSessions", {
      tokenHash: args.tokenHash, watchTokenHash: args.watchTokenHash, domainId: domain._id,
      communityId: domain.communityId, userId: handoff.userId, expiresAt, kind,
    });
    return { ok: true as const, expiresAt, kind };
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
    return session
      ? { revoked: true, userId: String(session.userId), communityId: String(session.communityId) }
      : { revoked: false };
  },
});

// Whose session this is, so a sign-out ticket from the site's other origin can
// be checked against it before anything is revoked.
export const readCommunityAppSessionOwnerInternal = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("communityAppSessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    return session ? { userId: String(session.userId), communityId: String(session.communityId) } : null;
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
    // Private only when minted as private on an origin that is still a private twin.
    const kind = session.kind === "private" && domain.kind === "private" ? "private" as const : "site" as const;
    return { ok: true as const, userId: String(session.userId), authSubject, communityId: String(session.communityId), kind };
  },
});
