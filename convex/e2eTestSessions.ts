// Staging-only sign-in for the nightly end-to-end run. A robot can't click
// through Google, so this hands the run a community site's own sessions (the
// site and its private twin) for one of two fixed test accounts, exactly as
// the real sign-in hop would mint them. It refuses everywhere but staging:
// POLYNET_ALLOW_SEED must be "1" (the release's settings check forbids it in
// production) and the caller must present POLYNET_E2E_SECRET. It can only ever
// sign in the two accounts below; "newcomer" is reset to brand-new first.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT } from "../shared/legalDocuments";
import { COMMUNITY_APP_SESSION_TTL_MS } from "../shared/communityAppSession";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { syncCommunityActiveMemberCount } from "./communityCore";

export const E2E_ACCOUNTS = {
  founder: { authSubject: "e2e-founder", handle: "e2e-founder", name: "E2E Founder" },
  newcomer: { authSubject: "e2e-newcomer", handle: "e2e-newcomer", name: "E2E Newcomer" },
} as const;

export function e2eSignInAllowed(env: Record<string, string | undefined>): boolean {
  return env.POLYNET_ALLOW_SEED === "1" && Boolean(String(env.POLYNET_E2E_SECRET ?? "").trim());
}

// A complete profile (handle, name, accepted legal), as the staging seed makes them.
async function upsertAccount(ctx: any, account: (typeof E2E_ACCOUNTS)[keyof typeof E2E_ACCOUNTS], nowMs: number) {
  const holder = await ctx.db.query("users").withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", account.handle)).first();
  if (holder && holder.authSubject !== account.authSubject) throw new Error("e2e_handle_taken");
  const existing = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", account.authSubject)).unique();
  // Setup needs a picture too; a generated one, as the staging seed uses.
  const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${account.handle}`;
  const fields = { displayName: account.name, handle: account.handle, normalizedHandle: account.handle, avatarUrl, updatedAt: nowMs };
  const userId = existing?._id ?? await ctx.db.insert("users", { authSubject: account.authSubject, ...fields, createdAt: nowMs });
  if (existing) await ctx.db.patch(userId, fields);
  const detail = await getUniqueUserProfileDetailByUserId<any>(ctx, userId);
  const profile = { displayName: account.name, avatarUrl, onboardingCompletedAt: nowMs, updatedAt: nowMs };
  if (detail) await ctx.db.patch(detail._id, profile);
  else await ctx.db.insert("userProfileDetails", { userId, ...profile, createdAt: nowMs });
  await recordCurrentPlatformLegalAcceptance(ctx, {
    userId, termsVersion: TERMS_OF_SERVICE_DOCUMENT.version, privacyPolicyVersion: PRIVACY_AI_DATA_POLICY_DOCUMENT.version,
    source: "e2e", acceptedAt: nowMs,
  });
  return userId;
}

// Brand-new in this community: no membership, request, subscription, checkout or claim.
async function resetNewcomer(ctx: any, communityId: any, userId: any) {
  const byPair = (table: string) => ctx.db.query(table)
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).collect();
  for (const table of ["communityMemberships", "communityJoinRequests", "communitySubscriptions"]) {
    for (const row of await byPair(table)) await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db.query("checkoutSessions").withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId)).collect()) {
    if (String(row.communityId) !== String(communityId)) continue;
    if (row.claimToken) {
      const claim = await ctx.db.query("purchaseClaims").withIndex("by_claimToken", (q: any) => q.eq("claimToken", row.claimToken)).first();
      if (claim) await ctx.db.delete(claim._id);
    }
    await ctx.db.delete(row._id);
  }
  await syncCommunityActiveMemberCount({ ctx, communityId });
}

export const mintE2eSessionsInternal = internalMutation({
  args: {
    account: v.union(v.literal("founder"), v.literal("newcomer")),
    communitySlug: v.string(),
    siteTokenHash: v.string(),
    siteWatchTokenHash: v.string(),
    twinTokenHash: v.string(),
    twinWatchTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    if (!e2eSignInAllowed(process.env)) throw new Error("e2e_not_allowed_on_this_deployment");
    const nowMs = Date.now();
    const community = await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", args.communitySlug)).first();
    if (!community) throw new Error("community_not_found");
    const domains = await ctx.db.query("communityDomains").withIndex("by_community", (q: any) => q.eq("communityId", community._id)).collect();
    const site = domains.find((row: any) => row.kind !== "private");
    const twin = domains.find((row: any) => row.kind === "private");
    if (!site || !twin) throw new Error("community_has_no_site");
    const userId = await upsertAccount(ctx, E2E_ACCOUNTS[args.account], nowMs);
    if (args.account === "newcomer") await resetNewcomer(ctx, community._id, userId);
    const expiresAt = nowMs + COMMUNITY_APP_SESSION_TTL_MS;
    for (const [domain, tokenHash, watchTokenHash, kind] of [
      [site, args.siteTokenHash, args.siteWatchTokenHash, "site"],
      [twin, args.twinTokenHash, args.twinWatchTokenHash, "private"],
    ] as const) {
      await ctx.db.insert("communityAppSessions", {
        tokenHash, watchTokenHash, domainId: domain._id, communityId: community._id, userId, expiresAt, kind,
      });
    }
    return { site_origin: site.origin, twin_origin: twin.origin };
  },
});
