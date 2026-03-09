import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityAgentDraftLike,
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityMessageReactionLike,
  type CommunityPricePointLike,
  type CommunityResourceLike,
  maybeDeleteStorageAsset,
  normalizeBannerFocus,
  normalizeEntryPolicy,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalCommunityImageUrl,
  normalizeOptionalText,
  normalizeSlug,
  normalizeVisibility,
  requireCommunityManager,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

async function mapCommunityRecord(ctx: any, row: CommunityLike): Promise<{
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  description: string | null;
  avatar_url: string | null;
  avatar_storage_id: string | null;
  banner_url: string | null;
  banner_storage_id: string | null;
  banner_focus_x: number;
  banner_focus_y: number;
  banner_zoom: number;
  visibility: string;
  entry_policy: string;
  created_at: string;
  updated_at: string;
}> {
  const branding = await resolveCommunityBrandingFields(ctx, row);
  const entryPolicy = resolveCommunityEntryPolicy(row);
  const userIdCache = new Map<string, string | null>();
  return {
    id: String(row._id),
    slug: row.slug,
    name: row.name,
    owner_id: (await resolvePublicUserId(ctx, row.ownerId, userIdCache)) ?? String(row.ownerId),
    description: row.description ?? null,
    avatar_url: branding.avatar_url,
    avatar_storage_id: branding.avatar_storage_id,
    banner_url: branding.banner_url,
    banner_storage_id: branding.banner_storage_id,
    banner_focus_x: branding.banner_focus_x,
    banner_focus_y: branding.banner_focus_y,
    banner_zoom: branding.banner_zoom,
    visibility: row.visibility,
    entry_policy: entryPolicy,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const createCommunity = mutation({
  args: {
    ownerId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    visibility: v.optional(v.string()),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    entryPolicy: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const billingStatus = await ctx.runQuery(api.auth.getBuilderBillingStatus, {
      authSubject: args.authSubject ?? undefined,
      nowMs,
    });
    if (!billingStatus || String(billingStatus.builder_tier ?? "").trim().toLowerCase() !== "architect") {
      throw new Error("community_architect_required");
    }
    const ownedCommunities = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const maxCommunities = Math.max(0, Math.floor(Number(billingStatus.max_communities ?? 0)));
    if (maxCommunities > 0 && ownedCommunities.length >= maxCommunities) {
      throw new Error("community_owner_limit_reached");
    }
    const slug = normalizeSlug(args.slug);
    const existing = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) throw new Error("community_slug_taken");

    const visibility = normalizeVisibility(args.visibility);
    const entryPolicy = normalizeEntryPolicy(args.entryPolicy, "approval");
    const avatarStorageId = args.avatarStorageId ?? undefined;
    const bannerStorageId = args.bannerStorageId ?? undefined;
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug,
      name: normalizeName(args.name),
      description: normalizeOptionalText(args.description),
      avatarUrl: avatarStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.avatarUrl),
      avatarStorageId,
      bannerUrl: bannerStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.bannerUrl),
      bannerStorageId,
      bannerFocusX: normalizeBannerFocus(args.bannerFocusX),
      bannerFocusY: normalizeBannerFocus(args.bannerFocusY),
      bannerZoom: normalizeBannerZoom(args.bannerZoom),
      visibility,
      entryPolicy,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(communityId)) as CommunityLike | null;
    if (!created) throw new Error("community_create_failed");
    return await mapCommunityRecord(ctx, created);
  },
});

export const generateCommunityBrandingUploadUrl = mutation({
  args: {
    authSubject: v.optional(v.string()),
    kind: v.union(v.literal("avatar"), v.literal("banner")),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return {
      kind: args.kind,
      uploadUrl,
    };
  },
});

export const saveCommunitySettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    visibility: v.optional(v.string()),
    monthlyAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    yearlyAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const normalizedSlug = normalizeSlug(args.slug);
    const existingBySlug = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", normalizedSlug))
      .first()) as CommunityLike | null;
    if (existingBySlug && String(existingBySlug._id) !== String(args.communityId)) {
      throw new Error("community_slug_taken");
    }

    const normalizePlanAmount = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return Math.max(1, Math.floor(parsed));
    };
    const monthlyAmount = normalizePlanAmount(args.monthlyAmountBaseUnits);
    const yearlyAmount = normalizePlanAmount(args.yearlyAmountBaseUnits);
    const hasPaidPlan = monthlyAmount !== null || yearlyAmount !== null;
    const currentEntryPolicy = resolveCommunityEntryPolicy(community);
    const nextEntryPolicy = hasPaidPlan
      ? currentEntryPolicy === "paid_subscription"
        ? "paid_subscription"
        : "paid_unlock"
      : currentEntryPolicy === "approval"
        ? "approval"
        : "open";
    const currency = String(args.currency ?? "usd")
      .trim()
      .toLowerCase() || "usd";
    const currencyDecimals = Math.max(0, Math.floor(args.currencyDecimals ?? 2));
    const nextName = normalizeName(args.name);
    const nextDescription = normalizeOptionalText(args.description);
    const nextAvatarStorageId =
      args.avatarStorageId !== undefined
        ? (args.avatarStorageId ?? undefined)
        : args.avatarUrl !== undefined
          ? undefined
          : community.avatarStorageId;
    const nextBannerStorageId =
      args.bannerStorageId !== undefined
        ? (args.bannerStorageId ?? undefined)
        : args.bannerUrl !== undefined
          ? undefined
          : community.bannerStorageId;
    const nextAvatarUrl =
      nextAvatarStorageId
        ? undefined
        : args.avatarUrl !== undefined
          ? normalizeOptionalCommunityImageUrl(args.avatarUrl)
          : community.avatarUrl;
    const nextBannerUrl =
      nextBannerStorageId
        ? undefined
        : args.bannerUrl !== undefined
          ? normalizeOptionalCommunityImageUrl(args.bannerUrl)
          : community.bannerUrl;
    const nextBannerFocusX =
      args.bannerFocusX !== undefined ? normalizeBannerFocus(args.bannerFocusX) : normalizeBannerFocus(community.bannerFocusX);
    const nextBannerFocusY =
      args.bannerFocusY !== undefined ? normalizeBannerFocus(args.bannerFocusY) : normalizeBannerFocus(community.bannerFocusY);
    const nextBannerZoom =
      args.bannerZoom !== undefined ? normalizeBannerZoom(args.bannerZoom) : normalizeBannerZoom(community.bannerZoom);
    const nextVisibility = normalizeVisibility(args.visibility);

    const previousAvatarStorageId = community.avatarStorageId;
    const previousBannerStorageId = community.bannerStorageId;

    await ctx.db.patch(community._id as any, {
      name: nextName,
      slug: normalizedSlug,
      description: nextDescription,
      avatarUrl: nextAvatarUrl,
      avatarStorageId: nextAvatarStorageId,
      bannerUrl: nextBannerUrl,
      bannerStorageId: nextBannerStorageId,
      bannerFocusX: nextBannerFocusX,
      bannerFocusY: nextBannerFocusY,
      bannerZoom: nextBannerZoom,
      visibility: nextVisibility,
      entryPolicy: nextEntryPolicy,
      updatedAt: nowMs,
    });

    if (previousAvatarStorageId && String(previousAvatarStorageId) !== String(nextAvatarStorageId ?? "")) {
      await maybeDeleteStorageAsset(ctx, previousAvatarStorageId);
    }
    if (previousBannerStorageId && String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")) {
      await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
    }

    const upsertPricePoint = async (
      billingPeriod: "monthly" | "yearly",
      amountBaseUnits: number | null,
    ): Promise<string | null> => {
      const rows = (await ctx.db
        .query("communityPricePoints" as any)
        .withIndex("by_community_billingPeriod", (q: any) =>
          q.eq("communityId", args.communityId).eq("billingPeriod", billingPeriod),
        )
        .collect()) as CommunityPricePointLike[];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      const currentRows = rows.filter((row) => Boolean(row.isCurrent)).sort((a, b) => b.updatedAt - a.updatedAt);
      const current = currentRows[0] ?? null;

      if (amountBaseUnits === null) {
        for (const row of currentRows) {
          await ctx.db.patch(row._id as any, {
            isCurrent: false,
            archivedAt: row.archivedAt ?? nowMs,
            updatedAt: nowMs,
          });
        }
        return null;
      }

      const hasMatchingCurrent = Boolean(
        current &&
          current.amountBaseUnits === amountBaseUnits &&
          current.currency === currency &&
          current.currencyDecimals === currencyDecimals,
      );

      if (hasMatchingCurrent && current) {
        await ctx.db.patch(current._id as any, {
          name: nextName,
          description: nextDescription,
          isCurrent: true,
          archivedAt: undefined,
          updatedAt: nowMs,
        });
        for (const extra of currentRows.slice(1)) {
          await ctx.db.patch(extra._id as any, {
            isCurrent: false,
            archivedAt: extra.archivedAt ?? nowMs,
            updatedAt: nowMs,
          });
        }
        return String(current._id);
      }

      for (const row of currentRows) {
        await ctx.db.patch(row._id as any, {
          isCurrent: false,
          archivedAt: row.archivedAt ?? nowMs,
          updatedAt: nowMs,
        });
      }

      const pricePointId = await ctx.db.insert("communityPricePoints" as any, {
        communityId: args.communityId,
        kind: nextEntryPolicy === "paid_subscription" ? "subscription" : "unlock",
        billingPeriod,
        name: nextName,
        description: nextDescription,
        amountBaseUnits,
        currency,
        currencyDecimals,
        isCurrent: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return String(pricePointId);
    };

    await upsertPricePoint("monthly", monthlyAmount);
    await upsertPricePoint("yearly", yearlyAmount);

    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    const branding = await resolveCommunityBrandingFields(ctx, updated);
    return {
      community_id: String(updated._id),
      name: updated.name,
      slug: updated.slug,
      description: updated.description ?? null,
      avatar_url: branding.avatar_url,
      avatar_storage_id: branding.avatar_storage_id,
      banner_url: branding.banner_url,
      banner_storage_id: branding.banner_storage_id,
      banner_focus_x: branding.banner_focus_x,
      banner_focus_y: branding.banner_focus_y,
      banner_zoom: branding.banner_zoom,
      visibility: updated.visibility,
      updated_at: toIsoString(updated.updatedAt),
    };
  },
});

export const saveCommunityOneLiner = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    description: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nextDescription = normalizeOptionalText(args.description);
    await ctx.db.patch(community._id as any, {
      description: nextDescription,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    return {
      community_id: String(updated._id),
      description: updated.description ?? null,
      updated_at: toIsoString(updated.updatedAt),
    };
  },
});

export const deleteCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (String(community.ownerId) !== String(args.userId)) {
      throw new Error("community_owner_required");
    }

    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityMembershipLike[];
    for (const membership of memberships) {
      await ctx.db.delete(membership._id as any);
    }

    const joinRequests = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityJoinRequestLike[];
    for (const row of joinRequests) {
      await ctx.db.delete(row._id as any);
    }

    const pricePoints = await ctx.db
      .query("communityPricePoints" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect();
    for (const row of pricePoints) {
      await ctx.db.delete(row._id);
    }

    const subscriptions = await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId))
      .collect();
    for (const row of subscriptions) {
      await ctx.db.delete(row._id);
    }

    const purchaseClaims = await ctx.db
      .query("purchaseClaims")
      .withIndex("by_community_status", (q: any) => q.eq("communityId", args.communityId))
      .collect();
    for (const row of purchaseClaims) {
      await ctx.db.delete(row._id);
    }

    const checkoutSessions = await ctx.db
      .query("checkoutSessions")
      .collect();
    for (const row of checkoutSessions) {
      if (String(row.communityId ?? "") !== String(args.communityId)) continue;
      await ctx.db.delete(row._id);
    }

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    for (const row of resources) {
      await ctx.db.delete(row._id as any);
    }

    const memberSettings = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityMemberSettingsLike[];
    for (const row of memberSettings) {
      await ctx.db.delete(row._id as any);
    }

    const drafts = (await ctx.db
      .query("communityAgentDrafts" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityAgentDraftLike[];
    for (const row of drafts) {
      await ctx.db.delete(row._id as any);
    }

    const threads = (await ctx.db
      .query("communityChatThreads" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityChatThreadLike[];
    for (const thread of threads) {
      const messages = (await ctx.db
        .query("communityChatMessages" as any)
        .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
        .collect()) as CommunityChatMessageLike[];
      for (const message of messages) {
        const reactions = (await ctx.db
          .query("communityMessageReactions" as any)
          .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
          .collect()) as CommunityMessageReactionLike[];
        for (const reaction of reactions) {
          await ctx.db.delete(reaction._id as any);
        }
        await ctx.db.delete(message._id as any);
      }
      await ctx.db.delete(thread._id as any);
    }

    await ctx.db.delete(community._id as any);
    return { ok: true };
  },
});
