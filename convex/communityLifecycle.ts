import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  type CommunityLike,
  type CommunityPricePointLike,
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
  getCommunityPublishReadinessBlockingFields,
  type CommunityPublishReadinessInput,
} from "../shared/communityPublishReadiness";
import {
  canReceiveCommunityRevenue,
  type StripeConnectRevenueDestinationLike,
} from "./stripeConnectAccountCore";
import {
  requireCommunityFounderFundingForPublish,
  resolveAdditionalManagedCommunityAdmission,
} from "./founderInferenceCore";
import { COMMUNITY_FUNDING_POLICY_MANAGED } from "../shared/founderInference";
import { ensureGeneralChannel } from "./communityChannelCore";

const COMMUNITY_DELETION_QUARANTINE_CODE =
  "community_delete_lifecycle_migration_blocked" as const;

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

function requireCommunityPublishReadinessTransition(input: {
  currentVisibility?: string | null;
  nextVisibility?: string | null;
  current: CommunityPublishReadinessInput;
  next: CommunityPublishReadinessInput;
}): void {
  const blocking = getCommunityPublishReadinessBlockingFields(input);
  if (blocking.length > 0) {
    throw new Error(`community_publish_ready_required:${blocking.join(",")}`);
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
  requireCommunityPublishReadinessTransition({
    currentVisibility: args.community.visibility,
    nextVisibility: args.state.nextVisibility,
    current: {
      name: args.community.name,
      oneLiner: args.community.oneLiner,
      avatarUrl: args.community.avatarUrl,
      avatarStorageId: args.community.avatarStorageId,
      bannerUrl: args.community.bannerUrl,
      bannerStorageId: args.community.bannerStorageId,
    },
    next: {
      name: args.state.nextName,
      oneLiner: args.state.nextOneLiner,
      avatarUrl: args.state.nextAvatarUrl,
      avatarStorageId: args.state.nextAvatarStorageId,
      bannerUrl: args.state.nextBannerUrl,
      bannerStorageId: args.state.nextBannerStorageId,
    },
  });
  if (
    args.community.visibility !== "published" &&
    args.state.nextVisibility === "published"
  ) {
    await requireCommunityFounderFundingForPublish(
      args.ctx,
      args.communityId,
    );
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
    const additionalCommunityAdmission =
      await resolveAdditionalManagedCommunityAdmission(ctx, ownerId);
    if (!additionalCommunityAdmission.ok) {
      throw new Error(
        `community_funding_required_before_create:${additionalCommunityAdmission.code}`,
      );
    }
    const slug = normalizeSlug(args.slug);
    const existing = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) throw new Error("community_slug_taken");

    const requestedVisibility = args.visibility === undefined
      ? "unlisted"
      : normalizeVisibility(args.visibility);
    if (requestedVisibility === "published") {
      throw new Error("community_founder_funding_required_to_publish");
    }
    const visibility = "unlisted" as const;
    const entryPolicy = normalizeEntryPolicy(args.entryPolicy, "approval");
    const avatarStorageId = args.avatarStorageId ?? undefined;
    const bannerStorageId = args.bannerStorageId ?? undefined;
    const name = normalizeName(args.name);
    const oneLiner = normalizeOptionalText(args.oneLiner);
    const avatarUrl = avatarStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.avatarUrl);
    const bannerUrl = bannerStorageId ? undefined : normalizeOptionalCommunityImageUrl(args.bannerUrl);
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
      inferenceFundingPolicy: COMMUNITY_FUNDING_POLICY_MANAGED,
      entryPolicy,
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ensureGeneralChannel({ ctx, communityId, nowMs });
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

export const saveCommunityAbout = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    about: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = Date.now();
    const about = normalizeOptionalText(args.about, 8_000);
    await ctx.db.patch(community._id as any, {
      about,
      updatedAt: nowMs,
    });
    return {
      community_id: String(community._id),
      about: about ?? null,
      updated_at: toIsoString(nowMs),
    };
  },
});

/**
 * Rolling-deployment compatibility for already-loaded launcher clients.
 * New first-party clients must use the narrow saveCommunityAbout and settings
 * mutations instead. Remove only after the legacy function has no live callers.
 */
export const saveCommunityLaunchProfile = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });

    const nextName =
      args.name !== undefined ? normalizeName(args.name) : community.name;
    const nextSlug =
      args.slug !== undefined ? normalizeSlug(args.slug) : community.slug;
    const nextOneLiner =
      args.oneLiner !== undefined
        ? normalizeOptionalText(args.oneLiner)
        : community.oneLiner;
    const nextAbout =
      args.about !== undefined
        ? normalizeOptionalText(args.about, 8_000)
        : community.about;
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
    const nextAvatarUrl = nextAvatarStorageId
      ? undefined
      : args.avatarUrl !== undefined
        ? normalizeOptionalCommunityImageUrl(args.avatarUrl)
        : community.avatarUrl;
    const nextBannerUrl = nextBannerStorageId
      ? undefined
      : args.bannerUrl !== undefined
        ? normalizeOptionalCommunityImageUrl(args.bannerUrl)
        : community.bannerUrl;
    const nextAvatarFocusX =
      args.avatarFocusX !== undefined
        ? normalizeAvatarFocus(args.avatarFocusX)
        : normalizeAvatarFocus(community.avatarFocusX);
    const nextAvatarFocusY =
      args.avatarFocusY !== undefined
        ? normalizeAvatarFocus(args.avatarFocusY)
        : normalizeAvatarFocus(community.avatarFocusY);
    const nextAvatarZoom =
      args.avatarZoom !== undefined
        ? normalizeAvatarZoom(args.avatarZoom)
        : normalizeAvatarZoom(community.avatarZoom);
    const nextBannerFocusX =
      args.bannerFocusX !== undefined
        ? normalizeBannerFocus(args.bannerFocusX)
        : normalizeBannerFocus(community.bannerFocusX);
    const nextBannerFocusY =
      args.bannerFocusY !== undefined
        ? normalizeBannerFocus(args.bannerFocusY)
        : normalizeBannerFocus(community.bannerFocusY);
    const nextBannerZoom =
      args.bannerZoom !== undefined
        ? normalizeBannerZoom(args.bannerZoom)
        : normalizeBannerZoom(community.bannerZoom);
    const nextVisibility =
      args.visibility !== undefined
        ? normalizeVisibility(args.visibility)
        : community.visibility;

    const identityChanged =
      nextName !== community.name || nextSlug !== community.slug;
    const brandingChanged =
      !sameOptionalText(nextAvatarUrl, community.avatarUrl) ||
      !sameOptionalId(nextAvatarStorageId, community.avatarStorageId) ||
      !sameNumber(
        nextAvatarFocusX,
        normalizeAvatarFocus(community.avatarFocusX),
      ) ||
      !sameNumber(
        nextAvatarFocusY,
        normalizeAvatarFocus(community.avatarFocusY),
      ) ||
      !sameNumber(nextAvatarZoom, normalizeAvatarZoom(community.avatarZoom)) ||
      !sameOptionalText(nextBannerUrl, community.bannerUrl) ||
      !sameOptionalId(nextBannerStorageId, community.bannerStorageId) ||
      !sameNumber(
        nextBannerFocusX,
        normalizeBannerFocus(community.bannerFocusX),
      ) ||
      !sameNumber(
        nextBannerFocusY,
        normalizeBannerFocus(community.bannerFocusY),
      ) ||
      !sameNumber(nextBannerZoom, normalizeBannerZoom(community.bannerZoom));
    const visibilityChanged = nextVisibility !== community.visibility;

    if (identityChanged || brandingChanged || visibilityChanged) {
      await requireCommunityOwner({
        ctx,
        communityId: args.communityId,
        userId,
      });
    }

    const existingBySlug = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", nextSlug))
      .first()) as CommunityLike | null;
    if (
      existingBySlug &&
      String(existingBySlug._id) !== String(args.communityId)
    ) {
      throw new Error("community_slug_taken");
    }

    requireCommunityPublishReadinessTransition({
      currentVisibility: community.visibility,
      nextVisibility,
      current: {
        name: community.name,
        oneLiner: community.oneLiner,
        avatarUrl: community.avatarUrl,
        avatarStorageId: community.avatarStorageId,
        bannerUrl: community.bannerUrl,
        bannerStorageId: community.bannerStorageId,
      },
      next: {
        name: nextName,
        oneLiner: nextOneLiner,
        avatarUrl: nextAvatarUrl,
        avatarStorageId: nextAvatarStorageId,
        bannerUrl: nextBannerUrl,
        bannerStorageId: nextBannerStorageId,
      },
    });
    if (community.visibility !== "published" && nextVisibility === "published") {
      await requireCommunityFounderFundingForPublish(ctx, args.communityId);
    }

    const previousAvatarStorageId = community.avatarStorageId;
    const previousBannerStorageId = community.bannerStorageId;
    await ctx.db.patch(community._id as any, {
      name: nextName,
      slug: nextSlug,
      oneLiner: nextOneLiner,
      about: nextAbout,
      avatarUrl: nextAvatarUrl,
      avatarStorageId: nextAvatarStorageId,
      avatarFocusX: nextAvatarFocusX,
      avatarFocusY: nextAvatarFocusY,
      avatarZoom: nextAvatarZoom,
      bannerUrl: nextBannerUrl,
      bannerStorageId: nextBannerStorageId,
      bannerFocusX: nextBannerFocusX,
      bannerFocusY: nextBannerFocusY,
      bannerZoom: nextBannerZoom,
      visibility: nextVisibility,
      updatedAt: nowMs,
    });

    if (
      previousAvatarStorageId &&
      String(previousAvatarStorageId) !== String(nextAvatarStorageId ?? "")
    ) {
      await maybeDeleteStorageAsset(ctx, previousAvatarStorageId);
    }
    if (
      previousBannerStorageId &&
      String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")
    ) {
      await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
    }

    const updated = (await ctx.db.get(
      community._id as any,
    )) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    return await mapCommunityRecord(ctx, updated);
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
    await requireCommunityOwner({
      ctx,
      communityId: args.communityId,
      userId,
    });

    throw new ConvexError({
      code: COMMUNITY_DELETION_QUARANTINE_CODE,
      reason: COMMUNITY_DELETION_QUARANTINE_CODE,
    });
  },
});
