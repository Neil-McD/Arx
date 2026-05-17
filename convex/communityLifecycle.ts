import { api, internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityAgentConfigLike,
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
  normalizeAvatarFocus,
  normalizeAvatarZoom,
  normalizeBannerFocus,
  normalizeEntryPolicy,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalCommunityImageUrl,
  normalizeOptionalText,
  normalizeSlug,
  normalizeVisibility,
  requireCommunityManager,
  requireCommunityOwner,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  normalizeCommunityFunnelConfigInput,
  saveCommunityFunnelConfigInternal,
} from "./communityFunnel";
import {
  requireAccountSetupCompleteForUser,
  requireProfileSetupCompleteForUser,
} from "./accountSetupCore";
import {
  getCommunityPublishReadinessMissingFields,
  type CommunityPublishReadinessInput,
} from "../shared/communityPublishReadiness";
import {
  canReceiveCommunityRevenue,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";

async function mapCommunityRecord(ctx: any, row: CommunityLike): Promise<{
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
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
    one_liner: row.oneLiner ?? null,
    about: row.about ?? null,
    avatar_url: branding.avatar_url,
    avatar_storage_id: branding.avatar_storage_id,
    avatar_focus_x: branding.avatar_focus_x,
    avatar_focus_y: branding.avatar_focus_y,
    avatar_zoom: branding.avatar_zoom,
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

async function saveCommunityOneLinerInternal(
  ctx: any,
  community: CommunityLike,
  oneLiner: string | null | undefined,
  nowMs: number,
): Promise<CommunityLike> {
  const nextOneLiner = normalizeOptionalText(oneLiner);
  await ctx.db.patch(community._id as any, {
    oneLiner: nextOneLiner,
    updatedAt: nowMs,
  });
  const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
  if (!updated) throw new Error("community_not_found");
  return updated;
}

function requireCommunityPublishReady(input: CommunityPublishReadinessInput): void {
  const missing = getCommunityPublishReadinessMissingFields(input);
  if (missing.length > 0) {
    throw new Error(`community_publish_ready_required:${missing.join(",")}`);
  }
}

function normalizePlanAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.floor(parsed));
}

function sameOptionalId(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

function sameOptionalText(left: unknown, right: unknown): boolean {
  return String(left ?? "") === String(right ?? "");
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

async function getCurrentCommunityPriceAmounts(ctx: any, communityId: any): Promise<{
  monthlyAmount: number | null;
  annualAmount: number | null;
}> {
  const currentPricePointRows = (await ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityPricePointLike[];
  const pickCurrentAmount = (billingPeriod: "monthly" | "annual"): number | null => {
    const current =
      currentPricePointRows
        .filter((row) => row.billingPeriod === billingPeriod && row.isCurrent)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    return current ? Math.max(1, Math.floor(Number(current.amountBaseUnits ?? 0))) : null;
  };
  return {
    monthlyAmount: pickCurrentAmount("monthly"),
    annualAmount: pickCurrentAmount("annual"),
  };
}

function resolveCommunitySettingsState(args: any, community: CommunityLike, currentPricing: {
  monthlyAmount: number | null;
  annualAmount: number | null;
}) {
  const normalizedSlug = normalizeSlug(args.slug);
  const monthlyAmount = normalizePlanAmount(args.monthlyAmountBaseUnits);
  const annualAmount = normalizePlanAmount(args.annualAmountBaseUnits);
  if (monthlyAmount !== null && annualAmount !== null) {
    throw new Error("community_pricing_mode_invalid");
  }

  const monetizationChanged =
    monthlyAmount !== currentPricing.monthlyAmount || annualAmount !== currentPricing.annualAmount;
  const hasPaidPlan = monthlyAmount !== null || annualAmount !== null;
  const currentEntryPolicy = resolveCommunityEntryPolicy(community);
  const nextEntryPolicy: "open" | "approval" | "paid_subscription" = hasPaidPlan
    ? "paid_subscription"
    : currentEntryPolicy === "approval"
      ? "approval"
      : "open";
  const currency = String(args.currency ?? "usd")
    .trim()
    .toLowerCase() || "usd";
  const currencyDecimals = Math.max(0, Math.floor(args.currencyDecimals ?? 2));
  const nextName = normalizeName(args.name);
  const nextOneLiner = normalizeOptionalText(args.oneLiner);
  const nextAbout = normalizeOptionalText(args.about, 8_000);
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
  const nextAvatarFocusX =
    args.avatarFocusX !== undefined ? normalizeAvatarFocus(args.avatarFocusX) : normalizeAvatarFocus(community.avatarFocusX);
  const nextAvatarFocusY =
    args.avatarFocusY !== undefined ? normalizeAvatarFocus(args.avatarFocusY) : normalizeAvatarFocus(community.avatarFocusY);
  const nextAvatarZoom =
    args.avatarZoom !== undefined ? normalizeAvatarZoom(args.avatarZoom) : normalizeAvatarZoom(community.avatarZoom);
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
  const nextVisibility = args.visibility !== undefined
    ? normalizeVisibility(args.visibility)
    : community.visibility;

  return {
    normalizedSlug,
    monthlyAmount,
    annualAmount,
    monetizationChanged,
    nextEntryPolicy,
    currency,
    currencyDecimals,
    nextName,
    nextOneLiner,
    nextAbout,
    nextAvatarStorageId,
    nextBannerStorageId,
    nextAvatarUrl,
    nextAvatarFocusX,
    nextAvatarFocusY,
    nextAvatarZoom,
    nextBannerUrl,
    nextBannerFocusX,
    nextBannerFocusY,
    nextBannerZoom,
    nextVisibility,
    identityChanged: nextName !== community.name || normalizedSlug !== community.slug,
    brandingChanged:
      !sameOptionalText(nextAvatarUrl, community.avatarUrl) ||
      !sameOptionalId(nextAvatarStorageId, community.avatarStorageId) ||
      !sameNumber(nextAvatarFocusX, normalizeAvatarFocus(community.avatarFocusX)) ||
      !sameNumber(nextAvatarFocusY, normalizeAvatarFocus(community.avatarFocusY)) ||
      !sameNumber(nextAvatarZoom, normalizeAvatarZoom(community.avatarZoom)) ||
      !sameOptionalText(nextBannerUrl, community.bannerUrl) ||
      !sameOptionalId(nextBannerStorageId, community.bannerStorageId) ||
      !sameNumber(nextBannerFocusX, normalizeBannerFocus(community.bannerFocusX)) ||
      !sameNumber(nextBannerFocusY, normalizeBannerFocus(community.bannerFocusY)) ||
      !sameNumber(nextBannerZoom, normalizeBannerZoom(community.bannerZoom)),
    visibilityChanged: nextVisibility !== community.visibility,
  };
}

async function requirePaidCommunityPricingReady(args: {
  ctx: any;
  community: CommunityLike;
  nowMs: number;
}) {
  const ownerBilling = (await args.ctx.runQuery(
    internal.auth.getAccountCommerceAccessForUserInternal as any,
    {
      userId: args.community.ownerId,
      nowMs: args.nowMs,
    },
  )) as { has_payouts?: unknown } | null;
  if (ownerBilling?.has_payouts !== true) {
    throw new Error("community_payout_access_required");
  }
  const connectAccount = (await args.ctx.runQuery(
    internal.creatorCommerce.getUserStripeConnectAccountInternal as any,
    {
      userId: args.community.ownerId,
    },
  )) as StripeConnectRevenueDestinationLike | null;
  if (!connectAccount) {
    throw new Error("community_stripe_connect_required");
  }
  if (!canReceiveCommunityRevenue(connectAccount)) {
    throw new Error("community_stripe_connect_not_ready");
  }
}

async function requireCommunitySettingsPermissions(args: {
  ctx: any;
  communityId: any;
  community: CommunityLike;
  userId: any;
  state: ReturnType<typeof resolveCommunitySettingsState>;
  nowMs: number;
}) {
  if (args.state.identityChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  if (args.state.brandingChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  if (args.state.visibilityChanged) {
    await requireCommunityOwner({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
  }
  if (args.state.nextVisibility === "published") {
    requireCommunityPublishReady({
      name: args.state.nextName,
      oneLiner: args.state.nextOneLiner,
      avatarUrl: args.state.nextAvatarUrl,
      avatarStorageId: args.state.nextAvatarStorageId,
      bannerUrl: args.state.nextBannerUrl,
      bannerStorageId: args.state.nextBannerStorageId,
    });
  }
  if (args.state.monetizationChanged && (args.state.monthlyAmount !== null || args.state.annualAmount !== null)) {
    await requirePaidCommunityPricingReady({
      ctx: args.ctx,
      community: args.community,
      nowMs: args.nowMs,
    });
  }
}

async function upsertCommunityPricePoint(args: {
  ctx: any;
  communityId: any;
  billingPeriod: "monthly" | "annual";
  amountBaseUnits: number | null;
  name: string;
  description: string | null | undefined;
  currency: string;
  currencyDecimals: number;
  nowMs: number;
}): Promise<string | null> {
  const rows = (await args.ctx.db
    .query("communityPricePoints" as any)
    .withIndex("by_community_billingPeriod", (q: any) =>
      q.eq("communityId", args.communityId).eq("billingPeriod", args.billingPeriod),
    )
    .collect()) as CommunityPricePointLike[];
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  const currentRows = rows.filter((row) => Boolean(row.isCurrent)).sort((a, b) => b.updatedAt - a.updatedAt);
  const current = currentRows[0] ?? null;

  if (args.amountBaseUnits === null) {
    for (const row of currentRows) {
      await args.ctx.db.patch(row._id as any, {
        isCurrent: false,
        archivedAt: row.archivedAt ?? args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    return null;
  }

  const hasMatchingCurrent = Boolean(
    current &&
      current.amountBaseUnits === args.amountBaseUnits &&
      current.currency === args.currency &&
      current.currencyDecimals === args.currencyDecimals,
  );

  if (hasMatchingCurrent && current) {
    await args.ctx.db.patch(current._id as any, {
      name: args.name,
      description: args.description,
      isCurrent: true,
      archivedAt: undefined,
      updatedAt: args.nowMs,
    });
    for (const extra of currentRows.slice(1)) {
      await args.ctx.db.patch(extra._id as any, {
        isCurrent: false,
        archivedAt: extra.archivedAt ?? args.nowMs,
        updatedAt: args.nowMs,
      });
    }
    return String(current._id);
  }

  for (const row of currentRows) {
    await args.ctx.db.patch(row._id as any, {
      isCurrent: false,
      archivedAt: row.archivedAt ?? args.nowMs,
      updatedAt: args.nowMs,
    });
  }

  const pricePointId = await args.ctx.db.insert("communityPricePoints" as any, {
    communityId: args.communityId,
    billingPeriod: args.billingPeriod,
    name: args.name,
    description: args.description,
    amountBaseUnits: args.amountBaseUnits,
    currency: args.currency,
    currencyDecimals: args.currencyDecimals,
    isCurrent: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(pricePointId);
}

async function upsertCommunitySettingsPricePoints(args: {
  ctx: any;
  communityId: any;
  state: ReturnType<typeof resolveCommunitySettingsState>;
  nowMs: number;
}) {
  await upsertCommunityPricePoint({
    ctx: args.ctx,
    communityId: args.communityId,
    billingPeriod: "monthly",
    amountBaseUnits: args.state.monthlyAmount,
    name: args.state.nextName,
    description: args.state.nextOneLiner,
    currency: args.state.currency,
    currencyDecimals: args.state.currencyDecimals,
    nowMs: args.nowMs,
  });
  await upsertCommunityPricePoint({
    ctx: args.ctx,
    communityId: args.communityId,
    billingPeriod: "annual",
    amountBaseUnits: args.state.annualAmount,
    name: args.state.nextName,
    description: args.state.nextOneLiner,
    currency: args.state.currency,
    currencyDecimals: args.state.currencyDecimals,
    nowMs: args.nowMs,
  });
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
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    oneLiner: v.optional(v.union(v.string(), v.null())),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    entryPolicy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.ownerId,
      authSubject: args.authSubject ?? null,
    });
    await requireAccountSetupCompleteForUser(ctx, ownerId);
    const nowMs = Date.now();
    const billingStatus = await ctx.runQuery(api.auth.getAccountCommerceStatus, {
      authSubject: args.authSubject ?? undefined,
      nowMs,
    });
    if (!billingStatus) {
      throw new Error("community_builder_required");
    }
    const ownedCommunities = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const maxCommunities = Math.max(0, Math.floor(Number(billingStatus.max_communities ?? 0)));
    if (maxCommunities <= 0) {
      throw new Error("community_builder_required");
    }
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
    const name = normalizeName(args.name);
    const oneLiner = normalizeOptionalText(args.oneLiner);
    const avatarUrl = avatarStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.avatarUrl);
    const bannerUrl = bannerStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.bannerUrl);
    if (visibility === "published") {
      requireCommunityPublishReady({
        name,
        oneLiner,
        avatarUrl,
        avatarStorageId,
        bannerUrl,
        bannerStorageId,
      });
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug,
      name,
      oneLiner,
      avatarUrl,
      avatarStorageId,
      avatarFocusX: normalizeAvatarFocus(args.avatarFocusX),
      avatarFocusY: normalizeAvatarFocus(args.avatarFocusY),
      avatarZoom: normalizeAvatarZoom(args.avatarZoom),
      bannerUrl,
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
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireProfileSetupCompleteForUser(ctx, userId);
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
    oneLiner: v.optional(v.union(v.string(), v.null())),
    about: v.optional(v.union(v.string(), v.null())),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    bannerStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerUrl: v.optional(v.union(v.string(), v.null())),
    bannerFocusX: v.optional(v.number()),
    bannerFocusY: v.optional(v.number()),
    bannerZoom: v.optional(v.number()),
    visibility: v.optional(v.string()),
    monthlyAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    annualAmountBaseUnits: v.optional(v.union(v.number(), v.null())),
    currency: v.optional(v.string()),
    currencyDecimals: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const currentPricing = await getCurrentCommunityPriceAmounts(ctx, args.communityId);
    const settingsState = resolveCommunitySettingsState(args, community, currentPricing);
    const existingBySlug = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", settingsState.normalizedSlug))
      .first()) as CommunityLike | null;
    if (existingBySlug && String(existingBySlug._id) !== String(args.communityId)) {
      throw new Error("community_slug_taken");
    }

    await requireCommunitySettingsPermissions({
      ctx,
      communityId: args.communityId,
      community,
      userId,
      state: settingsState,
      nowMs,
    });

    const previousAvatarStorageId = community.avatarStorageId;
    const previousBannerStorageId = community.bannerStorageId;

    await ctx.db.patch(community._id as any, {
      name: settingsState.nextName,
      slug: settingsState.normalizedSlug,
      oneLiner: settingsState.nextOneLiner,
      about: settingsState.nextAbout,
      avatarUrl: settingsState.nextAvatarUrl,
      avatarStorageId: settingsState.nextAvatarStorageId,
      avatarFocusX: settingsState.nextAvatarFocusX,
      avatarFocusY: settingsState.nextAvatarFocusY,
      avatarZoom: settingsState.nextAvatarZoom,
      bannerUrl: settingsState.nextBannerUrl,
      bannerStorageId: settingsState.nextBannerStorageId,
      bannerFocusX: settingsState.nextBannerFocusX,
      bannerFocusY: settingsState.nextBannerFocusY,
      bannerZoom: settingsState.nextBannerZoom,
      visibility: settingsState.nextVisibility,
      entryPolicy: settingsState.nextEntryPolicy,
      updatedAt: nowMs,
    });

    if (previousAvatarStorageId && String(previousAvatarStorageId) !== String(settingsState.nextAvatarStorageId ?? "")) {
      await maybeDeleteStorageAsset(ctx, previousAvatarStorageId);
    }
    if (previousBannerStorageId && String(previousBannerStorageId) !== String(settingsState.nextBannerStorageId ?? "")) {
      await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
    }

    await upsertCommunitySettingsPricePoints({
      ctx,
      communityId: args.communityId,
      state: settingsState,
      nowMs,
    });

    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    const branding = await resolveCommunityBrandingFields(ctx, updated);
    return {
      community_id: String(updated._id),
      name: updated.name,
      slug: updated.slug,
      one_liner: updated.oneLiner ?? null,
      about: updated.about ?? null,
      avatar_url: branding.avatar_url,
      avatar_storage_id: branding.avatar_storage_id,
      avatar_focus_x: branding.avatar_focus_x,
      avatar_focus_y: branding.avatar_focus_y,
      avatar_zoom: branding.avatar_zoom,
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
    oneLiner: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const updated = await saveCommunityOneLinerInternal(ctx, community, args.oneLiner, nowMs);
    return {
      community_id: String(updated._id),
      one_liner: updated.oneLiner ?? null,
      updated_at: toIsoString(updated.updatedAt),
    };
  },
});


export const saveCommunityPublicPresentation = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    config: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const normalizedFunnel = normalizeCommunityFunnelConfigInput(args.config);
    const funnel = await saveCommunityFunnelConfigInternal(
      ctx,
      args.communityId,
      normalizedFunnel,
      nowMs,
    );
    return {
      community_id: String(community._id),
      updated_at: toIsoString(nowMs),
      funnel,
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
    const { community } = await requireCommunityOwner({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

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

    const agentConfigs = (await ctx.db
      .query("communityAgentConfigs" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityAgentConfigLike[];
    for (const row of agentConfigs) {
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
